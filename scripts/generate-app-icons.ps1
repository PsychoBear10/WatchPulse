# Generate WatchPulse Apple-Style Liquid Glass Application Icons (.png and .ico)
Add-Type -AssemblyName System.Drawing

function Create-SquirclePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $rect = New-Object System.Drawing.RectangleF $x, $y, $diameter, $diameter

    # Top-Left Arc
    $path.AddArc($rect, 180, 90)
    # Top-Right Arc
    $rect.X = $x + $width - $diameter
    $path.AddArc($rect, 270, 90)
    # Bottom-Right Arc
    $rect.Y = $y + $height - $diameter
    $path.AddArc($rect, 0, 90)
    # Bottom-Left Arc
    $rect.X = $x
    $path.AddArc($rect, 90, 90)

    $path.CloseFigure()
    return $path
}

function Create-CapsulePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = [Math]::Min($radius * 2, [Math]::Min($width, $height))
    $rect = New-Object System.Drawing.RectangleF $x, $y, $diameter, $diameter

    $path.AddArc($rect, 180, 90)
    $rect.X = $x + $width - $diameter
    $path.AddArc($rect, 270, 90)
    $rect.Y = $y + $height - $diameter
    $path.AddArc($rect, 0, 90)
    $rect.X = $x
    $path.AddArc($rect, 90, 90)

    $path.CloseFigure()
    return $path
}

Write-Host "Rendering 512x512 Master Icon..."
$master = New-Object System.Drawing.Bitmap 512, 512, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($master)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

# 1. Outer Liquid Glass Specular Shadow & Squircle
$pad = 20.0
$w = 512.0 - ($pad * 2)
$h = 512.0 - ($pad * 2)
$rad = 108.0

# Soft shadow passes
for ($i = 6; $i -ge 1; $i--) {
    $sPad = $pad - ($i * 1.5)
    $sW = 512.0 - ($sPad * 2)
    $sH = 512.0 - ($sPad * 2)
    $sPath = Create-SquirclePath $sPad ($sPad + ($i * 2.5)) $sW $sH ($rad + ($i * 1.5))
    $sAlpha = [int](14 - ($i * 2))
    $sBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($sAlpha, 99, 102, 241))
    $g.FillPath($sBrush, $sPath)
    $sBrush.Dispose()
    $sPath.Dispose()
}

# 2. Main Squircle Body
$squircle = Create-SquirclePath $pad $pad $w $h $rad

# Gradient Background: #14192B (top-left) to #0A0D17 (center) to #060810 (bottom-right)
$bodyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    (New-Object System.Drawing.PointF $pad, $pad),
    (New-Object System.Drawing.PointF ($pad + $w), ($pad + $h)),
    ([System.Drawing.Color]::FromArgb(250, 20, 25, 43)),
    ([System.Drawing.Color]::FromArgb(255, 6, 8, 16))
)
$g.FillPath($bodyBrush, $squircle)
$bodyBrush.Dispose()

# 3. Ambient Lighting Glows
# Top-Left Ambient Indigo
$glow1Path = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow1Path.AddEllipse(20, 20, 260, 260)
$pbg1 = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow1Path
$pbg1.CenterColor = [System.Drawing.Color]::FromArgb(55, 129, 140, 248)
$pbg1.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 129, 140, 248))
$g.SetClip($squircle)
$g.FillPath($pbg1, $glow1Path)
$pbg1.Dispose()
$glow1Path.Dispose()

# Bottom-Right Ambient Emerald
$glow2Path = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow2Path.AddEllipse(232, 232, 260, 260)
$pbg2 = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow2Path
$pbg2.CenterColor = [System.Drawing.Color]::FromArgb(45, 16, 185, 129)
$pbg2.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 16, 185, 129))
$g.FillPath($pbg2, $glow2Path)
$pbg2.Dispose()
$glow2Path.Dispose()

# 4. Outer Specular Edge Glint (Apple-Style Top Inset Light)
$specBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    (New-Object System.Drawing.PointF 256, $pad),
    (New-Object System.Drawing.PointF 256, ($pad + $h)),
    ([System.Drawing.Color]::FromArgb(140, 255, 255, 255)),
    ([System.Drawing.Color]::FromArgb(15, 255, 255, 255))
)
$specPen = New-Object System.Drawing.Pen $specBrush, 3.5
$g.ResetClip()
$g.DrawPath($specPen, $squircle)
$specPen.Dispose()
$specBrush.Dispose()
$squircle.Dispose()

# 5. Iris Aperture Wave / Watching Arc
# Path: (80, 256) -> C(175, 105), (337, 105), (432, 256) -> C(337, 407), (175, 407), (80, 256)
$irisPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$irisPath.AddBezier(80.0, 256.0, 175.0, 105.0, 337.0, 105.0, 432.0, 256.0)
$irisPath.AddBezier(432.0, 256.0, 337.0, 407.0, 175.0, 407.0, 80.0, 256.0)
$irisPath.CloseFigure()

# Multi-stop linear gradient for iris arc: Indigo -> Sky -> Emerald
$irisBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    (New-Object System.Drawing.PointF 80, 105),
    (New-Object System.Drawing.PointF 432, 407),
    ([System.Drawing.Color]::FromArgb(255, 129, 140, 248)),
    ([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
)
$colorBlend = New-Object System.Drawing.Drawing2D.ColorBlend 3
$colorBlend.Colors = @(
    [System.Drawing.Color]::FromArgb(255, 129, 140, 248), # #818CF8
    [System.Drawing.Color]::FromArgb(255, 56, 189, 248),  # #38BDF8
    [System.Drawing.Color]::FromArgb(255, 16, 185, 129)   # #10B981
)
$colorBlend.Positions = @(0.0, 0.5, 1.0)
$irisBrush.InterpolationColors = $colorBlend

$irisPen = New-Object System.Drawing.Pen $irisBrush, 28.0
$irisPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$irisPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$irisPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawPath($irisPen, $irisPath)
$irisPen.Dispose()
$irisBrush.Dispose()
$irisPath.Dispose()

# 6. Concentric Glass Pulse Ring (Dashed Orbit)
$pulsePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 129, 140, 248)), 14.0
$pulsePen.DashPattern = @(1.4, 2.4)
$g.DrawEllipse($pulsePen, 160.0, 160.0, 192.0, 192.0)
$pulsePen.Dispose()

# 7. Concentric Solid Aperture Rim
$rimPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 165, 180, 252)), 10.0
$g.DrawEllipse($rimPen, 194.0, 194.0, 124.0, 124.0)
$rimPen.Dispose()

# 8. Center Live Jewel Core (Active Live Sensor Pupil)
$corePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$corePath.AddEllipse(215.0, 215.0, 82.0, 82.0)
$coreBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $corePath
$coreBrush.CenterColor = [System.Drawing.Color]::FromArgb(255, 52, 211, 153) # #34D399
$coreBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(240, 4, 120, 87)) # #047857
$g.FillPath($coreBrush, $corePath)
$coreBrush.Dispose()
$corePath.Dispose()

# 9. Specular Highlight Glint (Glass Flare)
$glintBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
$g.FillEllipse($glintBrush, 238.0, 235.0, 24.0, 24.0)
$glintBrush.Dispose()

# 10. Waveform Micro-Pulse Bars at Base
$bars = @(
    @{ X = 168.0; Y = 352.0; W = 26.0; H = 24.0; Color = [System.Drawing.Color]::FromArgb(235, 244, 63, 94) },   # Rose
    @{ X = 216.0; Y = 338.0; W = 26.0; H = 38.0; Color = [System.Drawing.Color]::FromArgb(235, 245, 158, 11) },  # Amber
    @{ X = 264.0; Y = 324.0; W = 26.0; H = 52.0; Color = [System.Drawing.Color]::FromArgb(245, 16, 185, 129) },  # Emerald
    @{ X = 312.0; Y = 352.0; W = 26.0; H = 24.0; Color = [System.Drawing.Color]::FromArgb(235, 56, 189, 248) }   # Sky
)

foreach ($b in $bars) {
    $bPath = Create-CapsulePath $b.X $b.Y $b.W $b.H 13.0
    $bBrush = New-Object System.Drawing.SolidBrush $b.Color
    $g.FillPath($bBrush, $bPath)
    $bBrush.Dispose()
    $bPath.Dispose()
}

$g.Dispose()

# Ensure directories exist
$buildDir = "build"
$publicDir = "public"
$distDir = "dist"
if (!(Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
if (!(Test-Path $publicDir)) { New-Item -ItemType Directory -Path $publicDir | Out-Null }
if (!(Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }

# Save 512x512 Master PNGs
Write-Host "Saving 512x512 PNGs..."
$master.Save("$buildDir/icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$master.Save("$publicDir/icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$master.Save("$distDir/icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Generate Scaled PNG Byte Buffers for Multi-Resolution ICO
$sizes = @(256, 128, 64, 48, 32, 16)
$pngEntries = @()

foreach ($sz in $sizes) {
    Write-Host "Rescaling to ${sz}x${sz}..."
    $scaled = New-Object System.Drawing.Bitmap $sz, $sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $sg = [System.Drawing.Graphics]::FromImage($scaled)
    $sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $sg.DrawImage($master, 0, 0, $sz, $sz)
    $sg.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $scaled.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $scaled.Dispose()
    $bytes = $ms.ToArray()
    $ms.Dispose()

    $pngEntries += @{
        Width = $sz
        Height = $sz
        Bytes = $bytes
    }
}
$master.Dispose()

# Build Multi-Resolution Windows .ICO file
Write-Host "Assembling Windows .ICO with $($pngEntries.Count) embedded PNG resolutions..."
$icoMs = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $icoMs

# ICONDIR Header (6 bytes)
$bw.Write([uint16]0)                  # idReserved = 0
$bw.Write([uint16]1)                  # idType = 1 (Icon)
$bw.Write([uint16]$pngEntries.Count)  # idCount

# Calculate image data start offset
$offset = 6 + ($pngEntries.Count * 16)

# Write ICONDIRENTRY for each image (16 bytes each)
foreach ($e in $pngEntries) {
    $wByte = if ($e.Width -ge 256) { [byte]0 } else { [byte]$e.Width }
    $hByte = if ($e.Height -ge 256) { [byte]0 } else { [byte]$e.Height }

    $bw.Write($wByte)                       # bWidth (0 for 256)
    $bw.Write($hByte)                       # bHeight (0 for 256)
    $bw.Write([byte]0)                      # bColorCount
    $bw.Write([byte]0)                      # bReserved
    $bw.Write([uint16]1)                    # wPlanes
    $bw.Write([uint16]32)                   # wBitCount
    $bw.Write([uint32]$e.Bytes.Length)      # dwBytesInRes
    $bw.Write([uint32]$offset)              # dwImageOffset

    $offset += $e.Bytes.Length
}

# Write PNG bytes
foreach ($e in $pngEntries) {
    $bw.Write($e.Bytes)
}

$bw.Flush()
$icoBytes = $icoMs.ToArray()
$bw.Dispose()
$icoMs.Dispose()

# Save ICO to build, public, and dist
[System.IO.File]::WriteAllBytes("$buildDir/icon.ico", $icoBytes)
[System.IO.File]::WriteAllBytes("$publicDir/favicon.ico", $icoBytes)
[System.IO.File]::WriteAllBytes("$distDir/favicon.ico", $icoBytes)

Write-Host "Success! Generated:"
Write-Host "  - build/icon.png ($((Get-Item "$buildDir/icon.png").Length) bytes)"
Write-Host "  - build/icon.ico ($((Get-Item "$buildDir/icon.ico").Length) bytes)"
Write-Host "  - public/icon.png & public/favicon.ico"
Write-Host "  - dist/icon.png & dist/favicon.ico"
