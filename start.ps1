# CleanAI Plus - Startup Script
# MongoDB, Backend ve Frontend'i Docker ile baslatir

# Set UTF-8 encoding for proper character display
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== CleanAI Plus Baslatiyor (Docker) ===" -ForegroundColor Cyan
Write-Host ""

# Docker kontrolu
try {
    docker --version | Out-Null
} catch {
    Write-Host "[HATA] Docker bulunamadi!" -ForegroundColor Red
    Write-Host "Lutfen Docker Desktop'i yukleyin: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Docker Compose kontrolu
try {
    docker-compose --version | Out-Null
} catch {
    Write-Host "[HATA] Docker Compose bulunamadi!" -ForegroundColor Red
    exit 1
}

# .env dosyasi kontrolu
if (-not (Test-Path ".\backend\.env")) {
    Write-Host "[UYARI] .env dosyasi bulunamadi. Ornek dosya kopyalaniyor..." -ForegroundColor Yellow
    Copy-Item ".\backend\.env.example" ".\backend\.env"
    Write-Host "[OK] .env dosyasi olusturuldu." -ForegroundColor Green
}

Write-Host "[START] Docker container'lari baslatiyor..." -ForegroundColor Green
Write-Host ""

# Tum servisleri baslat
docker-compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Uygulama Basarili Sekilde Baslatildi ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Container'lari kontrol et: docker-compose ps" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "MongoDB:  mongodb://localhost:27017" -ForegroundColor Cyan
    Write-Host "Backend:  http://localhost:8000" -ForegroundColor Cyan
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Loglari izle:   docker-compose logs -f" -ForegroundColor Yellow
    Write-Host "Durdur:         docker-compose down" -ForegroundColor Yellow
    Write-Host "Yeniden baslat: docker-compose restart" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[HATA] Container'lar baslatilamadi!" -ForegroundColor Red
    Write-Host "Hata detaylari icin: docker-compose logs" -ForegroundColor Yellow
}
