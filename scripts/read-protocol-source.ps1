param([switch]$RenderInWord)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $appRoot
$source = Get-ChildItem -LiteralPath $workspaceRoot -Filter 'Formato de Registro*.docx' | Select-Object -First 1
if (-not $source) { throw 'No se encontró el documento fuente.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($source.FullName)
try {
  $reader = New-Object System.IO.StreamReader($archive.GetEntry('word/document.xml').Open())
  [xml]$xml = $reader.ReadToEnd()
  $reader.Dispose()
  $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
  $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $body = @($xml.SelectNodes('//w:body/w:*',$ns))
  $title = $null
  $table = $null
  foreach ($node in $body) {
    $text = (($node.SelectNodes('.//w:t',$ns) | ForEach-Object { $_.InnerText }) -join '') -replace '\s+', ' '
    if ($node.LocalName -eq 'p' -and $text -match '^LISTA DE COTEJO PARA PROTOCOLO') { $title = $text.Trim(); continue }
    if ($title -and $node.LocalName -eq 'tbl') { $table = $node; break }
  }
  if (-not $table) { throw 'No se encontró la tabla del protocolo.' }
  $rows = @($table.SelectNodes('w:tr',$ns) | ForEach-Object {
    $cells = @($_.SelectNodes('w:tc',$ns) | ForEach-Object {
      ((($_.SelectNodes('.//w:t',$ns) | ForEach-Object { $_.InnerText }) -join '') -replace '\s+', ' ').Trim()
    })
    ,$cells
  })
  $result = [ordered]@{sourceFile=$source.Name;sourceSha256=(Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash;title=$title;rows=$rows}
  $target = Join-Path $appRoot 'reference'
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $target 'protocol-source.json'), ($result | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
  $result | ConvertTo-Json -Depth 8
} finally { $archive.Dispose() }
if ($RenderInWord) {
  $outDir = Join-Path $appRoot 'output'
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $doc = $null
  try {
    $doc = $word.Documents.Open($source.FullName, $false, $true)
    $doc.Repaginate()
    $find = $doc.Content.Duplicate
    $find.Find.Execute('LISTA DE COTEJO PARA PROTOCOLO') | Out-Null
    $start = $find.Information(3)
    $tableRange = $doc.Range($find.End, $doc.Content.End).Tables.Item(1).Range
    $endRange = $tableRange.Duplicate
    $endRange.Collapse(0)
    $end = $endRange.Information(3)
    $pdf = Join-Path $outDir 'protocolo-fuente-word.pdf'
    $doc.ExportAsFixedFormat($pdf, 17, $false, 0, 3, $start, $end)
    "Word: páginas $start a $end exportadas a $pdf"
  } finally {
    if ($doc) { $doc.Close(0); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }
    $word.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
}
