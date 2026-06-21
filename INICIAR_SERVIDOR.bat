@echo off
title Painel Supervisorio - Servidor Local
cd /d "%~dp0"

echo ===============================================
echo  PAINEL SUPERVISORIO - SERVIDOR LOCAL
echo ===============================================
echo.

if not exist "node_modules" (
  echo As dependencias ainda nao foram instaladas.
  echo Executando npm install automaticamente...
  echo.
  npm install
  echo.
)

npm start

echo.
pause
