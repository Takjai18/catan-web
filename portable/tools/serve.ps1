# Simple static file server for Catan portable (Windows PowerShell)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'index.html'))) {
  $root = $PSScriptRoot
}
$port = 8765
$prefix = "http://localhost:$port/"

Add-Type -AssemblyName System.Net.HttpListener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Cannot bind $prefix — is the port in use?"
  Write-Host $_.Exception.Message
  Write-Host "Tip: open index.html directly instead."
  exit 1
}

Write-Host "Serving $root"
Write-Host "Open $prefix"
Write-Host "Press Ctrl+C to stop."
Start-Process $prefix

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($req.Url.LocalPath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $rel = $rel -replace '/', [IO.Path]::DirectorySeparatorChar
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith([IO.Path]::GetFullPath($root))) {
      $res.StatusCode = 403
      $res.Close()
      continue
    }
    if ((Test-Path $path -PathType Container)) {
      $path = Join-Path $path 'index.html'
    }
    if (-not (Test-Path $path -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }
    $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
    $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
    $bytes = [IO.File]::ReadAllBytes($path)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
    try { $res.Close() } catch {}
  }
}
