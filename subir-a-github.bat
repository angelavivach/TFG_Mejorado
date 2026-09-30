@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Subir TimeCP a GitHub
echo ============================================
where git >nul 2>nul
if errorlevel 1 (
  echo Git no esta instalado. Descargalo de https://git-scm.com/downloads
  pause
  exit /b 1
)
if not exist ".git" (
  git init -b main
  git add .
  git commit -m "TimeCP listo para Render"
)
set /p URL=Pega la URL de tu repositorio de GitHub (https://github.com/usuario/repo.git): 
git remote remove origin >nul 2>nul
git remote add origin %URL%
git branch -M main
git push -u origin main
if errorlevel 1 (
  echo.
  echo Ha fallado la subida. Revisa la URL y que el repositorio de GitHub este VACIO.
) else (
  echo.
  echo Listo. Ahora ve a Render: New + ^> Blueprint ^> elige este repositorio.
)
pause
