# STServo Controller - Cross-Platform Startup Script (PowerShell Version)
Write-Host "STServo Controller - Cross-Platform Startup Script" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

# Check if Python is available
Write-Host "Checking Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: Python found" -ForegroundColor Green
        Write-Host $pythonVersion -ForegroundColor Cyan
    } else {
        Write-Host "ERROR: Python not found! Please install Python 3.8+" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} catch {
    Write-Host "ERROR: Python not found! Please install Python 3.8+" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Node.js is available
Write-Host ""
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: Node.js found" -ForegroundColor Green
        Write-Host $nodeVersion -ForegroundColor Cyan
    } else {
        Write-Host "ERROR: Node.js not found! Please install Node.js 14+" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} catch {
    Write-Host "ERROR: Node.js not found! Please install Node.js 14+" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if required files exist
Write-Host ""
Write-Host "Checking project files..." -ForegroundColor Yellow
if (-not (Test-Path "requirements.txt")) {
    Write-Host "ERROR: requirements.txt not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
if (-not (Test-Path "backend\app.py")) {
    Write-Host "ERROR: backend\app.py not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
if (-not (Test-Path "frontend-build")) {
    Write-Host "ERROR: frontend-build directory not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "OK: All project files found" -ForegroundColor Green

# Setup virtual environment
Write-Host ""
Write-Host "Setting up virtual environment..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create virtual environment!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "OK: Virtual environment created" -ForegroundColor Green
} else {
    Write-Host "OK: Virtual environment exists" -ForegroundColor Green
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to activate virtual environment!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "OK: Virtual environment activated" -ForegroundColor Green

# Check and install dependencies only if needed
Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow

# Check if Flask is already installed
python -c "import flask; print('installed')" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing Python dependencies..." -ForegroundColor Cyan
    pip install -r requirements.txt --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "OK: Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "OK: Dependencies already installed" -ForegroundColor Green
}

# Check if serve package is installed
Write-Host "Checking serve package..." -ForegroundColor Yellow
npx serve --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing serve package..." -ForegroundColor Cyan
    npm install -g serve --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Failed to install serve globally, will use npx..." -ForegroundColor Yellow
    } else {
        Write-Host "OK: Serve package installed" -ForegroundColor Green
    }
} else {
    Write-Host "OK: Serve package already installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "[1/2] Starting Backend Server..." -ForegroundColor Yellow
Write-Host "Starting Flask backend on http://localhost:5000" -ForegroundColor Cyan

$backendCommand = "cd /d $PWD && call venv\Scripts\activate.bat && echo Starting Backend Server... && echo Backend will be available at: http://localhost:5000 && echo. && cd backend && python app.py"
Start-Process cmd -ArgumentList "/k", $backendCommand -WindowStyle Normal

Write-Host "Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "[2/2] Starting Frontend Server..." -ForegroundColor Yellow
Write-Host "Starting React frontend on http://localhost:3000" -ForegroundColor Cyan

$frontendCommand = "cd /d $PWD && echo Starting Frontend Server... && echo Frontend will be available at: http://localhost:3000 && echo. && npx serve frontend-build -l 3000 --single"
Start-Process cmd -ArgumentList "/k", $frontendCommand -WindowStyle Normal

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Servers Started Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend API:  http://localhost:5000" -ForegroundColor Cyan
Write-Host "Frontend UI: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Both servers are now running in separate windows." -ForegroundColor Yellow
Write-Host "To stop the servers, close the terminal windows or run: taskkill /f /im python.exe && taskkill /f /im node.exe" -ForegroundColor Yellow
Write-Host ""

Write-Host "Opening browser..." -ForegroundColor Yellow
Start-Process "http://localhost:3000"
Write-Host ""
Write-Host "Press any key to close this launcher..." -ForegroundColor Yellow
Read-Host
