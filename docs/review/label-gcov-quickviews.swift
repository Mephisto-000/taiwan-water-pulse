// Scientific figure annotations only. Observations come from the real GCOV arrays.
import AppKit
import Foundation

struct Panel: Decodable {
    let raw: String
    let output: String
    let title: String
    let subtitle: String
    let gauge: String
    let width: Int
    let height: Int
    let scale_pixels: Int
}

func text(_ value: String, _ rect: NSRect, size: CGFloat, bold: Bool = false, color: NSColor = .white) {
    (value as NSString).draw(in: rect, withAttributes: [
        .font: bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size),
        .foregroundColor: color,
    ])
}

func bitmap(width: Int, height: Int, draw: () -> Void) throws -> NSBitmapImageRep {
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: width * 4, bitsPerPixel: 32), let graphics = NSGraphicsContext(bitmapImageRep: rep) else { throw NSError(domain: "Figure", code: 1) }
    rep.size = NSSize(width: width, height: height)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    graphics.imageInterpolation = .none
    NSColor(calibratedRed: 0.045, green: 0.095, blue: 0.11, alpha: 1).setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    draw()
    graphics.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

let manifest = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let panels = try JSONDecoder().decode([Panel].self, from: Data(contentsOf: manifest))
var rendered: [(NSImage, Int)] = []
for panel in panels {
    guard let raster = NSImage(contentsOf: manifest.deletingLastPathComponent().appendingPathComponent(panel.raw)) else { throw NSError(domain: "Figure", code: 2) }
    let width = 1200
    let plotWidth = CGFloat(width - 48)
    let plotHeight = plotWidth * CGFloat(panel.height) / CGFloat(panel.width)
    let height = Int(ceil(plotHeight)) + 238
    let rep = try bitmap(width: width, height: height) {
        text(panel.title, NSRect(x: 24, y: height - 47, width: width - 48, height: 34), size: 27, bold: true)
        text(panel.subtitle, NSRect(x: 24, y: height - 80, width: width - 48, height: 27), size: 21)
        text(panel.gauge, NSRect(x: 24, y: height - 108, width: width - 48, height: 26), size: 20)
        let frame = NSRect(x: 24, y: 124, width: plotWidth, height: plotHeight)
        raster.draw(in: frame, from: .zero, operation: .copy, fraction: 1)
        let barWidth = plotWidth * CGFloat(panel.scale_pixels) / CGFloat(panel.width)
        NSColor(calibratedWhite: 0, alpha: 0.72).setFill()
        NSRect(x: 39, y: 139, width: barWidth + 28, height: 48).fill()
        NSColor.white.setFill()
        NSRect(x: 49, y: 149, width: barWidth, height: 3).fill()
        text("500 m", NSRect(x: 49, y: 156, width: 100, height: 25), size: 20)
        NSColor(calibratedWhite: 0, alpha: 0.72).setFill()
        NSRect(x: width - 95, y: 139, width: 54, height: 40).fill()
        text("↑ N", NSRect(x: width - 88, y: 147, width: 50, height: 27), size: 22, bold: true)
        text("−35 dB", NSRect(x: 24, y: 80, width: 100, height: 25), size: 20)
        for i in 0..<256 { NSColor(calibratedWhite: CGFloat(i) / 255, alpha: 1).setFill(); NSRect(x: 125 + CGFloat(i) * 2, y: 84, width: 2.1, height: 17).fill() }
        text("+5 dB · γ⁰ HH", NSRect(x: 654, y: 80, width: 250, height: 25), size: 20)
        text("Mint: OSM reference outline · checkerboard: invalid source mask", NSRect(x: 24, y: 45, width: width - 48, height: 27), size: 20)
        text("Unfiltered source data · no classification · SI-assisted plotting code", NSRect(x: 24, y: 15, width: width - 48, height: 25), size: 19)
    }
    guard let data = rep.representation(using: .png, properties: [:]) else { throw NSError(domain: "Figure", code: 3) }
    try data.write(to: output.appendingPathComponent(panel.output))
    let image = NSImage(size: NSSize(width: width, height: height))
    image.addRepresentation(rep)
    rendered.append((image, height))
}
let compositeWidth = 2400
let row1 = Int(ceil(CGFloat(rendered[0].1) * 2 / 3))
let row2 = Int(ceil(CGFloat(rendered[3].1) * 2 / 3))
let compositeHeight = row1 + row2 + 100
let composite = try bitmap(width: compositeWidth, height: compositeHeight) {
    text("NISAR GCOV HH · native-grid alignment check", NSRect(x: 20, y: compositeHeight - 48, width: compositeWidth - 40, height: 40), size: 32, bold: true)
    text("Same fixed −35…+5 dB scale · full / dry / refilled dates · source pixels + geographic OSM reference", NSRect(x: 20, y: compositeHeight - 83, width: compositeWidth - 40, height: 30), size: 24)
    for (i, item) in rendered.enumerated() {
        let row = i / 3
        let y = row == 0 ? CGFloat(row2) : 0
        item.0.draw(in: NSRect(x: CGFloat((i % 3) * 800), y: y, width: 800, height: CGFloat(item.1) * 2 / 3), from: .zero, operation: .copy, fraction: 1)
    }
}
guard let data = composite.representation(using: .png, properties: [:]) else { throw NSError(domain: "Figure", code: 4) }
try data.write(to: output.appendingPathComponent("gcov-hh-six-panel.png"))
