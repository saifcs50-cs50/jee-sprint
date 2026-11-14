// JEE Sprint for Mac, self-contained edition (the one shared with friends).
// The app runs its own small sync server (Network.framework) and merges progress with the
// same JavaScript as the Node server (src/core.mjs via JavaScriptCore), so the other Mac
// needs nothing installed. The window shows the page from that server.
//
// Flags for testing: --home <dir> --port <n> --headless
import Cocoa
import WebKit
import Network
import JavaScriptCore
import Security

// MARK: - Options

struct Options {
    var home = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/JEE Sprint")
    var port: UInt16? = nil
    var headless = false

    static func parse(_ args: [String]) -> Options {
        var o = Options()
        var i = 1
        while i < args.count {
            switch args[i] {
            case "--home" where i + 1 < args.count: o.home = URL(fileURLWithPath: args[i + 1]); i += 1
            case "--port" where i + 1 < args.count: o.port = UInt16(args[i + 1]); i += 1
            case "--headless": o.headless = true
            default: break
            }
            i += 1
        }
        return o
    }
}

func log(_ message: String) { FileHandle.standardError.write(("[jee-sprint] " + message + "\n").data(using: .utf8)!) }

// MARK: - Storage + merge

final class Store {
    static let defaultPort: UInt16 = 5199
    static let backupsKept = 21
    let home: URL
    let token: String
    let port: UInt16
    private let js = JSContext()!

    init(home: URL, portOverride: UInt16?, coreJS: String) throws {
        self.home = home
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        let configURL = home.appendingPathComponent("config.json")
        var config = (try? JSONSerialization.jsonObject(with: Data(contentsOf: configURL))) as? [String: Any] ?? [:]
        if (config["token"] as? String)?.isEmpty ?? true {
            config["token"] = Store.newPairingCode()
            config["port"] = Int(Store.defaultPort)
            let data = try JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted])
            try data.write(to: configURL, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configURL.path)
        }
        token = config["token"] as! String
        port = portOverride ?? UInt16(config["port"] as? Int ?? Int(Store.defaultPort))

        js.exceptionHandler = { _, value in log("JS error: \(value?.toString() ?? "unknown")") }
        js.evaluateScript(coreJS)
        js.evaluateScript("""
        function __merge(storedText, incomingText) {
          var stored = null;
          try { stored = JSON.parse(storedText); } catch (e) {}
          var body = JSON.parse(incomingText);
          return JSON.stringify(mergeStates(normalizeState(stored), normalizeState(body && body.state)));
        }
        """)
    }

    // Short, typeable, unambiguous: 8 characters as XXXX-XXXX.
    static func newPairingCode() -> String {
        let alphabet = Array("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
        var bytes = [UInt8](repeating: 0, count: 8)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            fatalError("No secure random source")
        }
        let chars = bytes.map { alphabet[Int($0) % alphabet.count] }
        return String(chars[0..<4]) + "-" + String(chars[4..<8])
    }

    private var stateURL: URL { home.appendingPathComponent("state.json") }
    private var devicesURL: URL { home.appendingPathComponent("devices.json") }

    func sync(body: Data, now: Date = Date()) throws -> [String: Any] {
        guard let bodyText = String(data: body, encoding: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: body) else { throw HTTPError(400, "Sync data wasn't valid JSON.") }
        let stored = (try? String(contentsOf: stateURL, encoding: .utf8)) ?? "null"
        guard let merged = js.objectForKeyedSubscript("__merge").call(withArguments: [stored, bodyText])?.toString(),
              merged != "undefined", let mergedData = merged.data(using: .utf8) else { throw HTTPError(500, "The Mac couldn't merge that. Try again.") }
        try mergedData.write(to: stateURL, options: .atomic)
        try backup(mergedData, now: now)

        if let device = (parsed as? [String: Any])?["device"] as? [String: Any],
           let id = device["id"] as? String, id.range(of: "^[A-Za-z0-9_-]{1,40}$", options: .regularExpression) != nil {
            var devices = readDevices()
            devices[id] = ["name": String((device["name"] as? String ?? "Device").prefix(40)), "lastSeen": iso(now)]
            try JSONSerialization.data(withJSONObject: devices).write(to: devicesURL, options: .atomic)
        }
        return ["state": try JSONSerialization.jsonObject(with: mergedData), "devices": devicesList(), "serverTime": iso(now)]
    }

    func readDevices() -> [String: Any] {
        ((try? JSONSerialization.jsonObject(with: Data(contentsOf: devicesURL))) as? [String: Any]) ?? [:]
    }

    func devicesList() -> [[String: Any]] {
        readDevices().compactMap { id, value in
            guard let v = value as? [String: Any] else { return nil }
            return ["id": id, "name": v["name"] ?? "Device", "lastSeen": v["lastSeen"] ?? ""]
        }
    }

    private func backup(_ data: Data, now: Date) throws {
        let dir = home.appendingPathComponent("backups")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
        try data.write(to: dir.appendingPathComponent("state-\(f.string(from: now)).json"), options: .atomic)
        let old = (try FileManager.default.contentsOfDirectory(atPath: dir.path))
            .filter { $0.range(of: "^state-\\d{4}-\\d{2}-\\d{2}\\.json$", options: .regularExpression) != nil }.sorted()
        for name in old.dropLast(Store.backupsKept) { try? FileManager.default.removeItem(at: dir.appendingPathComponent(name)) }
    }

    private func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }
}

// MARK: - Minimal HTTP/1.1 server

struct HTTPError: Error { let status: Int; let message: String; init(_ s: Int, _ m: String) { status = s; message = m } }

struct Request {
    let method: String
    let path: String
    let headers: [String: String]
    let body: Data
    let fromLoopback: Bool
}

struct Response {
    var status: Int
    var type: String
    var body: Data
    static func json(_ status: Int, _ object: [String: Any]) -> Response {
        Response(status: status, type: "application/json; charset=utf-8",
                 body: (try? JSONSerialization.data(withJSONObject: object)) ?? Data())
    }
    static func ok(_ data: Any) -> Response { .json(200, ["success": true, "data": data, "error": NSNull()]) }
    static func fail(_ status: Int, _ error: String) -> Response { .json(status, ["success": false, "data": NSNull(), "error": error]) }
}

final class HTTPServer {
    static let maxBody = 512 * 1024
    private let listener: NWListener
    private let queue = DispatchQueue(label: "jee-sprint.http")
    private let handle: (Request) -> Response

    init(port: UInt16, handle: @escaping (Request) -> Response) throws {
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
        self.handle = handle
    }

    func start(onReady: @escaping () -> Void, onFail: @escaping (String) -> Void) {
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready: DispatchQueue.main.async(execute: onReady)
            case .failed(let e): DispatchQueue.main.async { onFail(e.localizedDescription) }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] c in self?.accept(c) }
        listener.start(queue: queue)
    }

    private func accept(_ c: NWConnection) {
        c.start(queue: queue)
        receive(c, Data())
    }

    private func receive(_ c: NWConnection, _ buffer: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
            guard let self else { return }
            var buf = buffer
            if let data { buf.append(data) }
            switch self.parse(buf, c) {
            case .ready(let req): self.send(c, self.handle(req))
            case .tooLarge: self.send(c, .fail(413, "Sync data is too large."))
            case .bad: self.send(c, .fail(400, "Bad request."))
            case .needMore:
                if done || error != nil { c.cancel() } else { self.receive(c, buf) }
            }
        }
    }

    private enum Parsed { case ready(Request), needMore, tooLarge, bad }

    private func parse(_ buf: Data, _ c: NWConnection) -> Parsed {
        guard let end = buf.range(of: Data("\r\n\r\n".utf8)) else {
            return buf.count > 16 * 1024 ? .bad : .needMore
        }
        guard let head = String(data: buf[buf.startIndex..<end.lowerBound], encoding: .utf8) else { return .bad }
        let lines = head.components(separatedBy: "\r\n")
        let parts = lines[0].split(separator: " ")
        guard parts.count >= 2 else { return .bad }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        let length = Int(headers["content-length"] ?? "0") ?? -1
        if length < 0 { return .bad }
        if length > HTTPServer.maxBody { return .tooLarge }
        let bodyStart = end.upperBound
        guard buf.count - (bodyStart - buf.startIndex) >= length else { return .needMore }
        let body = buf[bodyStart..<(bodyStart + length)]
        var loopback = false
        if case .hostPort(let host, _) = c.endpoint {
            let h = "\(host)"
            loopback = h == "127.0.0.1" || h.hasPrefix("::1") || h == "::ffff:127.0.0.1"
        }
        let rawPath = String(parts[1])
        let path = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath
        return .ready(Request(method: String(parts[0]), path: path, headers: headers, body: Data(body), fromLoopback: loopback))
    }

    private func send(_ c: NWConnection, _ r: Response) {
        let reason = [200: "OK", 400: "Bad Request", 401: "Unauthorized", 404: "Not Found", 413: "Payload Too Large", 500: "Internal Server Error"][r.status] ?? "OK"
        var out = Data("HTTP/1.1 \(r.status) \(reason)\r\nContent-Type: \(r.type)\r\nContent-Length: \(r.body.count)\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n".utf8)
        out.append(r.body)
        c.send(content: out, completion: .contentProcessed { _ in c.cancel() })
    }
}

// MARK: - Routes (same contract as server.mjs)

// The address this Mac uses to reach the network: open a UDP socket "towards" a public
// address (nothing is sent) and read back which local address the system picked.
func primaryAddress() -> String? {
    let fd = socket(AF_INET, SOCK_DGRAM, 0)
    guard fd >= 0 else { return nil }
    defer { close(fd) }
    var dest = sockaddr_in()
    dest.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    dest.sin_family = sa_family_t(AF_INET)
    dest.sin_port = UInt16(53).bigEndian
    inet_pton(AF_INET, "8.8.8.8", &dest.sin_addr)
    let connected = withUnsafePointer(to: &dest) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
    }
    guard connected == 0 else { return nil }
    var local = sockaddr_in()
    var len = socklen_t(MemoryLayout<sockaddr_in>.size)
    let named = withUnsafeMutablePointer(to: &local) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &len) }
    }
    guard named == 0 else { return nil }
    var text = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
    guard inet_ntop(AF_INET, &local.sin_addr, &text, socklen_t(INET_ADDRSTRLEN)) != nil else { return nil }
    let address = String(cString: text)
    return address == "0.0.0.0" || address.hasPrefix("127.") ? nil : address
}

// Every IPv4 address a phone on the same Wi-Fi could use, primary one first.
func lanAddresses() -> [String] {
    var found = interfaceAddresses()
    if let primary = primaryAddress() {
        found.removeAll { $0 == primary }
        found.insert(primary, at: 0)
    }
    return found
}

func interfaceAddresses() -> [String] {
    var result: [String] = []
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return result }
    defer { freeifaddrs(ifaddr) }
    for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
        let flags = Int32(ptr.pointee.ifa_flags)
        guard let addr = ptr.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET),
              flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0 else { continue }
        var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
            result.append(String(cString: host))
        }
    }
    return result
}

func constantTimeEqual(_ a: String, _ b: String) -> Bool {
    let x = Array(a.utf8), y = Array(b.utf8)
    guard x.count == y.count else { return false }
    return zip(x, y).reduce(0) { $0 | ($1.0 ^ $1.1) } == 0
}

func makeRouter(store: Store, publicDir: URL) -> (Request) -> Response {
    return { req in
        if req.method == "GET" && (req.path == "/" || req.path == "/index.html") {
            guard let html = try? String(contentsOf: publicDir.appendingPathComponent("index.html"), encoding: .utf8) else {
                return .fail(500, "The app's files are missing. Download JEE Sprint again.")
            }
            // Only this Mac's own window gets the pairing code baked into the page.
            let page = html.replacingOccurrences(of: "__SYNC_TOKEN__", with: req.fromLoopback ? store.token : "")
            return Response(status: 200, type: "text/html; charset=utf-8", body: Data(page.utf8))
        }
        if req.method == "GET" && req.path.hasPrefix("/fonts/") {
            let name = String(req.path.dropFirst(7))
            guard name.range(of: "^[a-z0-9-]{1,60}\\.woff2$", options: .regularExpression) != nil,
                  let data = try? Data(contentsOf: publicDir.appendingPathComponent("fonts").appendingPathComponent(name)) else {
                return .fail(404, "Not found.")
            }
            return Response(status: 200, type: "font/woff2", body: data)
        }
        if req.path.hasPrefix("/api/") {
            guard constantTimeEqual(req.headers["x-sync-token"] ?? "", store.token) else { return .fail(401, "Wrong or missing pairing code.") }
            if req.method == "POST" && req.path == "/api/sync" {
                do { return .ok(try store.sync(body: req.body)) }
                catch let e as HTTPError { return .fail(e.status, e.message) }
                catch { log("sync failed: \(error)"); return .fail(500, "The Mac couldn't save that. Try again.") }
            }
            if req.method == "GET" && req.path == "/api/info" {
                return .ok(["addresses": lanAddresses(), "devices": store.devicesList()])
            }
        }
        return .fail(404, "Not found.")
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    let store: Store
    let server: HTTPServer
    var window: NSWindow!
    var webView: WKWebView!

    init(store: Store, server: HTTPServer) { self.store = store; self.server = server }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1120, height: 860),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "JEE Sprint"
        window.minSize = NSSize(width: 420, height: 500)
        window.isReleasedWhenClosed = false
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("JEESprintMainWindow")
        window.makeKeyAndOrderFront(nil)
        server.start(onReady: { [weak self] in self?.load() }, onFail: { [weak self] message in self?.showError(message) })
        NSApp.activate(ignoringOtherApps: true)
    }

    // Closing the window keeps the app (and phone sync) running; the Dock icon brings it back.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }

    @objc func load() { webView.load(URLRequest(url: URL(string: "http://127.0.0.1:\(store.port)/")!)) }

    func showError(_ message: String) {
        log("server failed: \(message)")
        webView.loadHTMLString("""
        <html><body style="font:15px -apple-system;padding:48px">
        <h2>JEE Sprint couldn't start its sync service</h2>
        <p>Port \(store.port) is probably in use by another copy of JEE Sprint. Quit other copies, then reopen the app.</p>
        <p style="color:#666">Details: \(message)</p></body></html>
        """, baseURL: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, url.host != "127.0.0.1", action.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Hide JEE Sprint", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit JEE Sprint (stops phone sync)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let view = NSMenu(title: "View")
        let reload = NSMenuItem(title: "Reload", action: #selector(load), keyEquivalent: "r")
        reload.target = self
        view.addItem(reload)
        viewItem.submenu = view

        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = win
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }
}

// MARK: - Entry point

let options = Options.parse(CommandLine.arguments)
guard let resources = Bundle.main.resourceURL,
      let coreJS = try? String(contentsOf: resources.appendingPathComponent("core.js"), encoding: .utf8) else {
    log("core.js is missing from the app bundle"); exit(1)
}
let store: Store
do { store = try Store(home: options.home, portOverride: options.port, coreJS: coreJS) }
catch { log("couldn't open \(options.home.path): \(error)"); exit(1) }
let server: HTTPServer
do { server = try HTTPServer(port: store.port, handle: makeRouter(store: store, publicDir: resources.appendingPathComponent("public"))) }
catch { log("couldn't create the server: \(error)"); exit(1) }

if options.headless {
    server.start(onReady: { log("listening on :\(store.port), data in \(store.home.path)") },
                 onFail: { log("server failed: \($0)"); exit(1) })
    RunLoop.main.run()
} else {
    let app = NSApplication.shared
    let delegate = AppDelegate(store: store, server: server)
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}
