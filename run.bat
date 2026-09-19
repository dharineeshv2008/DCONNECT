@echo off
setlocal

echo ==============================================================================
echo  Disaster Management Coordination App - Local Runner
echo ==============================================================================

if "%DATABASE_PASSWORD%"=="" (
    set /p DATABASE_PASSWORD="Enter your Supabase database password: "
)

echo Starting Disaster Management Application...
java -version

echo If Maven is not installed globally, launching via VS Code Java Runner or embedded maven...
echo.
echo TIP: You can simply press F5 in VS Code or open DisasterCoordinationApplication.java and click 'Run'.
pause
