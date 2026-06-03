$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\frontend\dist')
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), 3000)
$listener.Start()
'LISTENING http://localhost:3000' | Out-File (Join-Path $root 'static_tcp_server.log')

function Get-ContentType([string] $file) {
  switch ([IO.Path]::GetExtension($file).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8'; break }
    '.js' { 'text/javascript; charset=utf-8'; break }
    '.css' { 'text/css; charset=utf-8'; break }
    '.png' { 'image/png'; break }
    '.svg' { 'image/svg+xml'; break }
    default { 'application/octet-stream'; break }
  }
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 1000
    $stream = $client.GetStream()
    $buffer = New-Object byte[] 4096
    $count = $stream.Read($buffer, 0, $buffer.Length)
    $request = [Text.Encoding]::ASCII.GetString($buffer, 0, $count)
    $line = ($request -split "`r?`n", 2)[0]

    $requestPath = 'index.html'
    if ($line -match '^[A-Z]+ /([^ ?]*)') {
      $requestPath = $matches[1]
      if ([string]::IsNullOrWhiteSpace($requestPath)) {
        $requestPath = 'index.html'
      }
    }

    $file = Join-Path $root $requestPath
    if (-not (Test-Path $file)) {
      $file = Join-Path $root 'index.html'
    }

    $bytes = [System.IO.File]::ReadAllBytes($file)
    $contentType = Get-ContentType $file
    $header = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n")
    $stream.Write($header, 0, $header.Length)
    $stream.Write($bytes, 0, $bytes.Length)
  } finally {
    $client.Close()
  }
}
