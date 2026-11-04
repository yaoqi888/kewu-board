$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

python -m PyInstaller --noconfirm --clean --onefile --windowed `
  --name "科务看板" `
  --icon "$Root/build-assets/kewu.ico" `
  --version-file "$Root/build-assets/version_info.txt" `
  --add-data "$Root/server/static;static" `
  --add-data "$Root/server/schema.sql;." `
  --add-data "$Root/server/holidays-2026.json;." `
  --add-data "$Root/build-assets/kewu.ico;." `
  --collect-all waitress --collect-all pystray `
  --distpath "build/dist" --workpath "build/work" --specpath "build" `
  "server/app.py"

Write-Host ""
Write-Host "已生成: build/dist/科务看板.exe" -ForegroundColor Green
