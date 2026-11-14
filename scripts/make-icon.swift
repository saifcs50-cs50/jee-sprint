// Draws the JEE Sprint icon: the exam screen's question-palette squares on navy.
// Usage: swift make-icon.swift <out.png> <size>
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3, let size = Int(args[2]), size > 0 else {
    FileHandle.standardError.write("usage: make-icon.swift <out.png> <size>\n".data(using: .utf8)!)
    exit(1)
}

func rgb(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
}

let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)

// macOS icon grid: 824pt body inset 100pt, continuous-ish corners.
ctx.addPath(CGPath(roundedRect: CGRect(x: 100, y: 100, width: 824, height: 824), cornerWidth: 185, cornerHeight: 185, transform: nil))
ctx.setFillColor(rgb(0x161d33))
ctx.fillPath()

let sq: CGFloat = 250, gap: CGFloat = 60, o: CGFloat = 232, top = o + sq + gap
let cells: [(CGFloat, CGFloat, UInt32)] = [(o, top, 0x27955a), (top, top, 0x6a4ec6), (o, o, 0xe2672f), (top, o, 0xb3b9c6)]
for (x, y, color) in cells {
    ctx.addPath(CGPath(roundedRect: CGRect(x: x, y: y, width: sq, height: sq), cornerWidth: 44, cornerHeight: 44, transform: nil))
    ctx.setFillColor(rgb(color))
    ctx.fillPath()
}

// A tick in the green ("answered") square.
ctx.setStrokeColor(rgb(0xffffff))
ctx.setLineWidth(36)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
ctx.move(to: CGPoint(x: o + 62, y: top + 128))
ctx.addLine(to: CGPoint(x: o + 108, y: top + 80))
ctx.addLine(to: CGPoint(x: o + 192, y: top + 172))
ctx.strokePath()

let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
guard CGImageDestinationFinalize(dest) else { exit(1) }
