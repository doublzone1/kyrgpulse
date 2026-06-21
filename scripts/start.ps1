param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "KyrgPulse: запуск Docker Compose..." -ForegroundColor Cyan

if ($Build) {
    docker compose up --build -d
} else {
    docker compose up -d
}

if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose завершился с ошибкой."
}

Write-Host ""
docker compose ps

Write-Host ""
Write-Host "Готово. Открой:" -ForegroundColor Green
Write-Host "Dashboard: http://localhost:3000/dashboard"
Write-Host "Frontend:  http://localhost:3000"
Write-Host "Swagger:   http://localhost:8000/docs"
Write-Host ""
Write-Host "Если объявлений нет, запусти: .\scripts\parse.ps1" -ForegroundColor Yellow
