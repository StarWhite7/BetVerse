$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
$brandRoot = Join-Path $PSScriptRoot '../../../public/brand'
$brandVisual = New-Object System.Windows.Media.DrawingVisual
$script:brandContext = $brandVisual.RenderOpen()
$brushConverter = New-Object System.Windows.Media.BrushConverter
function BrandBrush([string]$value) { return $brushConverter.ConvertFromInvariantString($value) }
function PaintBrandNode($element, [string]$inheritedFill) {
    if ($element.NodeType -ne [System.Xml.XmlNodeType]::Element) { return }
    $fill = $element.GetAttribute('fill')
    if (-not $fill) { $fill = $inheritedFill }
    $pushed = 0
    foreach ($transform in [regex]::Matches($element.GetAttribute('transform'), '(translate|scale|skewX)\(([^)]+)\)')) {
        $numbers = @($transform.Groups[2].Value -split '[, ]+' | Where-Object { $_ } | ForEach-Object { [double]::Parse($_, [Globalization.CultureInfo]::InvariantCulture) })
        switch ($transform.Groups[1].Value) {
            'translate' { $second=0; if ($numbers.Count -gt 1) {$second=$numbers[1]}; $script:brandContext.PushTransform([System.Windows.Media.TranslateTransform]::new($numbers[0],$second)) }
            'scale' { $second=$numbers[0]; if ($numbers.Count -gt 1) {$second=$numbers[1]}; $script:brandContext.PushTransform([System.Windows.Media.ScaleTransform]::new($numbers[0],$second)) }
            'skewX' { $script:brandContext.PushTransform([System.Windows.Media.SkewTransform]::new($numbers[0],0)) }
        }
        $pushed++
    }
    if ($element.LocalName -eq 'path') {
        $geometry = [System.Windows.Media.Geometry]::Parse($element.GetAttribute('d'))
        $script:brandContext.DrawGeometry((BrandBrush $fill),$null,$geometry)
    } elseif ($element.LocalName -eq 'rect') {
        $radius = 0; if ($element.GetAttribute('rx')) { $radius=[double]$element.GetAttribute('rx') }
        $rectangle = [System.Windows.Rect]::new(0,0,[double]$element.GetAttribute('width'),[double]$element.GetAttribute('height'))
        $script:brandContext.DrawRoundedRectangle((BrandBrush $fill),$null,$rectangle,$radius,$radius)
    }
    foreach ($child in $element.ChildNodes) { PaintBrandNode $child $fill }
    for ($index=0; $index -lt $pushed; $index++) { $script:brandContext.Pop() }
}
function PaintBrandAsset([string]$name,[double]$x,[double]$y,[double]$scale) {
    [xml]$asset = Get-Content -LiteralPath (Join-Path $brandRoot $name)
    $script:brandContext.PushTransform([System.Windows.Media.TranslateTransform]::new($x,$y))
    $script:brandContext.PushTransform([System.Windows.Media.ScaleTransform]::new($scale,$scale))
    PaintBrandNode $asset.DocumentElement '#000000'
    $script:brandContext.Pop(); $script:brandContext.Pop()
}
$script:brandContext.DrawRectangle((BrandBrush '#F5F3ED'),$null,[System.Windows.Rect]::new(0,0,1000,320))
$script:brandContext.DrawRectangle((BrandBrush '#101722'),$null,[System.Windows.Rect]::new(0,320,1000,320))
PaintBrandAsset 'betverse-wordmark-light.svg' 45 35 1.2
PaintBrandAsset 'bv-mark-light.svg' 50 190 .8
PaintBrandAsset 'app-icon.svg' 820 45 .13
PaintBrandAsset 'favicon.svg' 830 215 .55
PaintBrandAsset 'betverse-wordmark-dark.svg' 45 355 1.2
PaintBrandAsset 'bv-mark-dark.svg' 50 510 .8
PaintBrandAsset 'app-icon.svg' 820 365 .13
PaintBrandAsset 'favicon.svg' 830 535 .55
$script:brandContext.Close()
$bitmap = [System.Windows.Media.Imaging.RenderTargetBitmap]::new(1000,640,96,96,[System.Windows.Media.PixelFormats]::Pbgra32)
$bitmap.Render($brandVisual)
$encoder = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
$encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
$stream = [System.IO.File]::Create((Join-Path $PSScriptRoot 'preview.png'))
try { $encoder.Save($stream) } finally { $stream.Dispose() }
Write-Output 'Rendered docs/design/brand/preview.png using Windows vector geometry.'
