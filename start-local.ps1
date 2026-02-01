# CleanAI Plus - Local Startup Script
# Backend ve Frontend'i lokal olarak baslatir (Docker yok)

# Set UTF-8 encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== CleanAI Plus (Local Mode) Baslatiyor ===" -ForegroundColor Cyan
Write-Host ""

# Backend kontrolu
if (-not (Test-Path ".\backend\venv")) {
    Write-Host "[HATA] Backend virtual environment bulunamadi!" -ForegroundColor Red
    Write-Host "Lutfen once su komutu calistirin:" -ForegroundColor Yellow
    Write-Host "  cd backend" -ForegroundColor Yellow
    Write-Host "  python -m venv venv" -ForegroundColor Yellow
    Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor Yellow
    Write-Host "  pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

# Frontend kontrolu
if (-not (Test-Path ".\frontend\node_modules")) {
    Write-Host "[UYARI] Frontend dependencies bulunamadi. Yukleniyor..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

# .env dosyasi kontrolu
if (-not (Test-Path ".\backend\.env")) {
    Write-Host "[UYARI] .env dosyasi bulunamadi. Ornek dosya kopyalaniyor..." -ForegroundColor Yellow
    Copy-Item ".\backend\.env.example" ".\backend\.env"
    Write-Host "[OK] .env dosyasi olusturuldu." -ForegroundColor Green
}

Write-Host ""
Write-Host "[START] Backend baslatiyor..." -ForegroundColor Green
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; .\venv\Scripts\Activate.ps1; python main.py" -PassThru

Start-Sleep -Seconds 2

Write-Host "[START] Frontend baslatiyor..." -ForegroundColor Green
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev" -PassThru

Write-Host ""
Write-Host "=== Uygulama Basarili Sekilde Baslatildi ===" -ForegroundColor Green
Write-Host ""
Write-Host "MongoDB:  mongodb://localhost:27017 (Docker)" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000 (Local)" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173 (Local)" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend/Frontend durdurmak: Acilan terminal pencerelerini kapatin" -ForegroundColor Yellow