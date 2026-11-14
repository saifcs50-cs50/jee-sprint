// Dev tool: evaluate an expression inside the Android app's WebView over the DevTools protocol.
// 1. adb -s <serial> forward tcp:9336 localabstract:webview_devtools_remote_<pid of com.saif.jeesprint>
// 2. node scripts/cdp-eval.mjs "$(curl -s localhost:9336/json | jq -r '.[0].webSocketDebuggerUrl')" "<expression>"
const [ws, expr] = process.argv.slice(2);
if (!ws || !expr) {
  console.error("usage: node scripts/cdp-eval.mjs <ws-url> <expression>");
  process.exit(1);
}
const sock = new WebSocket(ws);
sock.onopen = () => sock.send(JSON.stringify({
  id: 1, method: "Runtime.evaluate",
  params: { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }
}));
sock.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id !== 1) return;
  const r = msg.result;
  console.log(JSON.stringify(r.exceptionDetails ? r.exceptionDetails : r.result.value, null, 2));
  sock.close();
};
sock.onerror = e => { console.error("ws error", e.message); process.exit(1); };
