@echo off
echo STServo Controller - Easy Launcher
echo ==================================
echo.
echo This launcher bypasses PowerShell execution policy restrictions.
echo.

REM Check if PowerShell is available
powershell -Command "Write-Host 'PowerShell is available'" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: PowerShell is not available!
    echo Please install PowerShell or use the manual startup method.
    pause
    exit /b 1
)

echo Starting STServo Controller...
echo.

REM Run the PowerShell script with execution policy bypass
powershell -ExecutionPolicy Bypass -File "%~dp0start-servo-controller.ps1"

echo.
echo Launcher finished.
pause
