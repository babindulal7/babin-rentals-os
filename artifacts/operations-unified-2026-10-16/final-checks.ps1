$ErrorActionPreference = 'Stop'
$verificationDir = Join-Path (Get-Location) 'artifacts/operations-unified-2026-10-16'
$suiteText = ''
for ($attempt = 0; $attempt -lt 180; $attempt++) {
  $suiteStream = [IO.File]::Open((Join-Path $verificationDir 'tests-full.log'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  $suiteReader = [IO.StreamReader]::new($suiteStream)
  try { $suiteText = $suiteReader.ReadToEnd() } finally { $suiteReader.Dispose() }
  if (($suiteText -match '(?m)^\s*Test Files\s+') -and ($suiteText -match '(?m)^\s*Tests\s+')) { break }
  Start-Sleep -Seconds 10
}
$suiteMatch = [regex]::Match($suiteText, '(?m)^\s*Tests\s+(\d+) passed\s+\((\d+)\)')
if (!$suiteMatch.Success -or $suiteMatch.Groups[1].Value -ne $suiteMatch.Groups[2].Value) {
  throw 'The complete test suite has not reported an all-green result. Inspect tests-full.log.'
}
$suiteCount = [int]$suiteMatch.Groups[1].Value
@{ total = $suiteCount; passed = $suiteCount; failed = 0; skipped = 0; at = [DateTime]::UtcNow.ToString('o') } |
  ConvertTo-Json | Set-Content .test-result.json
Write-Output "Full suite passed: $suiteCount tests."

& npm run check:pglite *> (Join-Path $verificationDir 'pglite.log')
if ($LASTEXITCODE -ne 0) { throw 'PGlite failed.' }
Write-Output 'PGlite passed.'
& npm run check:lifecycle *> (Join-Path $verificationDir 'lifecycle.log')
if ($LASTEXITCODE -ne 0) { throw 'Lifecycle failed.' }
Write-Output 'Lifecycle passed.'
& npm run build *> (Join-Path $verificationDir 'build.log')
if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
Write-Output 'Production build passed.'
