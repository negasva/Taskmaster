@echo off
:: Script para quitar Taskmaster del inicio de Windows

echo.
echo  ==========================================
echo   Quitando Taskmaster del inicio de Windows
echo  ==========================================
echo.

set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set ACCESO=%STARTUP%\Taskmaster.lnk

if exist "%ACCESO%" (
    del "%ACCESO%"
    echo  [OK] Listo. Taskmaster ya NO se abrira al prender la PC.
) else (
    echo  [!] Taskmaster no estaba en el inicio. No hay nada que quitar.
)

echo.
pause
