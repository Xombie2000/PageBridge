import AppKit

private let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)

private func writePNG(size: Int, relativePath: String, draw: (NSRect) -> Void) throws {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    NSGraphicsContext.current?.imageInterpolation = .high
    NSColor.clear.setFill()
    NSRect(x: 0, y: 0, width: size, height: size).fill()
    draw(NSRect(x: 0, y: 0, width: size, height: size))
    image.unlockFocus()

    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let data = bitmap.representation(using: .png, properties: [:]) else {
        throw CocoaError(.fileWriteUnknown)
    }
    try data.write(to: root.appendingPathComponent(relativePath), options: .atomic)
}

private func centeredText(_ text: String, in rect: NSRect, font: NSFont, color: NSColor) {
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color
    ]
    let size = text.size(withAttributes: attributes)
    let origin = NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2)
    text.draw(at: origin, withAttributes: attributes)
}

private func drawMark(in rect: NSRect, color: NSColor, lineWidth: CGFloat) {
    let unit = rect.width / 128
    let x: (CGFloat) -> CGFloat = { rect.minX + $0 * unit }
    let y: (CGFloat) -> CGFloat = { rect.minY + $0 * unit }
    let left = NSRect(x: x(6), y: y(24), width: 48 * unit, height: 80 * unit)
    let right = NSRect(x: x(74), y: y(24), width: 48 * unit, height: 80 * unit)

    color.setStroke()
    let leftPath = NSBezierPath(roundedRect: left, xRadius: 10 * unit, yRadius: 10 * unit)
    leftPath.lineWidth = lineWidth
    leftPath.stroke()
    let rightPath = NSBezierPath(roundedRect: right, xRadius: 10 * unit, yRadius: 10 * unit)
    rightPath.lineWidth = lineWidth
    rightPath.stroke()

    let arrow = NSBezierPath()
    arrow.lineWidth = lineWidth * 0.65
    arrow.lineCapStyle = .round
    arrow.lineJoinStyle = .round
    arrow.move(to: NSPoint(x: x(55), y: y(64)))
    arrow.line(to: NSPoint(x: x(71), y: y(64)))
    arrow.move(to: NSPoint(x: x(60), y: y(78)))
    arrow.line(to: NSPoint(x: x(71), y: y(64)))
    arrow.line(to: NSPoint(x: x(60), y: y(50)))
    arrow.stroke()

    centeredText("文", in: left, font: .systemFont(ofSize: 29 * unit, weight: .semibold), color: color)
    centeredText("A", in: right, font: .systemFont(ofSize: 34 * unit, weight: .bold), color: color)
}

for size in [16, 32, 48, 64, 128] {
    try writePNG(size: size, relativePath: "AutoEnglishExtension/Resources/icons/pagebridge-\(size).png") { rect in
        drawMark(in: rect, color: .black, lineWidth: max(1, rect.width * 0.055))
    }
}

for size in [16, 32, 64, 128, 256, 512, 1024] {
    try writePNG(size: size, relativePath: "AutoEnglishApp/Assets.xcassets/AppIcon.appiconset/appicon-\(size).png") { rect in
        let unit = rect.width / 1024
        let tile = rect.insetBy(dx: 62 * unit, dy: 62 * unit)
        let tilePath = NSBezierPath(roundedRect: tile, xRadius: 205 * unit, yRadius: 205 * unit)
        let gradient = NSGradient(colors: [
            NSColor(calibratedRed: 0.20, green: 0.30, blue: 0.82, alpha: 1),
            NSColor(calibratedRed: 0.04, green: 0.68, blue: 0.64, alpha: 1)
        ])!
        gradient.draw(in: tilePath, angle: -35)

        let markRect = NSRect(x: 156 * unit, y: 196 * unit, width: 712 * unit, height: 712 * unit)
        drawMark(in: markRect, color: .white, lineWidth: max(1, 42 * unit))
    }
}
