@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setupWhiteBlueAutomationConsole.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Setup failed with exit code %EXIT_CODE%.
) else (
  echo Setup completed successfully.
)
pause
exit /b %EXIT_CODE%
