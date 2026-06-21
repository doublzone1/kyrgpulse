$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "KyrgPulse: запускаю парсер lalafo.kg..." -ForegroundColor Cyan
docker exec -it kyrgpulse-backend python -m parsers.lalafo_parser
if ($LASTEXITCODE -ne 0) {
    throw "Парсер завершился с ошибкой."
}

Write-Host ""
Write-Host "KyrgPulse: обрабатываю данные и загружаю в базу..." -ForegroundColor Cyan
docker exec -it kyrgpulse-backend python -m processors.data_processor
if ($LASTEXITCODE -ne 0) {
    throw "Обработчик данных завершился с ошибкой."
}

Write-Host ""
Write-Host "KyrgPulse: обучаю ML-модель..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/analytics/train-model"
} catch {
    Write-Host "Модель не обучилась. Возможно, пока мало объявлений с площадью и комнатами." -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Готово. Обнови dashboard: http://localhost:3000/dashboard" -ForegroundColor Green
