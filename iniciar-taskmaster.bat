@echo off
:: Este archivo abre Taskmaster
:: Windows lo ejecuta automaticamente al prender la PC

set APP_DIR=%~dp0

:: Esperar 5 segundos para que Windows termine de cargar
timeout /t 5 /nobreak >nul

:: Si ya esta instalado el .exe, abrirlo
if exist "%LOCALAPPDATA%\Programs\Taskmaster\Taskmaster.exe" (
    start "" "%LOCALAPPDATA%\Programs\Taskmaster\Taskmaster.exe"
    goto fin
)

:: Si no esta instalado, abrir en modo desarrollo con Electron
if exist "%APP_DIR%node_modules\.bin\electron.cmd" (
    start "" "%APP_DIR%node_modules\.bin\electron.cmd" "%APP_DIR%"
    goto fin
)

:: Si no hay nada, avisar
echo No se encontro Taskmaster instalado.
echo Instala primero ejecutando: npm run build
pause

:fin
