@echo off
echo Starting WaterMe! Smart Garden System...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

REM Start the system
python waterme.py

REM If we get here, the system has stopped
echo.
echo WaterMe! system has stopped.
pause 