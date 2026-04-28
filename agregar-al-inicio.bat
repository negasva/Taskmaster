@echo off
:: Script para agregar Taskmaster al inicio de Windows
:: Doble click para ejecutar

echo.
echo  ==========================================
echo   Agregando Taskmaster al inicio de Windows
echo  ==========================================
echo.

:: Carpeta de Startup de Windows (la oficial)
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

:: Ruta del ejecutable instalado (electron en desarrollo)
set APP_DIR=%~dp0

:: Crear acceso directo en la carpeta Startup usando PowerShell
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%STARTUP%\Taskmaster.lnk'); $s.TargetPath='%APP_DIR%iniciar-taskmaster.bat'; $s.WorkingDirectory='%APP_DIR%'; $s.Description='Taskmaster Productividad'; $s.Save()"

echo  [OK] Taskmaster se abrira solo cuando prendas la PC
echo.
echo  Para quitar del inicio, ejecuta: quitar-del-inicio.bat
echo.
pause
