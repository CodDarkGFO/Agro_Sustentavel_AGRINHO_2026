@echo off
title Instalar dependencias - Painel Supervisorio
cd /d "%~dp0"

echo ===============================================
echo  INSTALANDO DEPENDENCIAS DO PAINEL
echo ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  echo Instale o Node.js e tente novamente.
  pause
  exit /b
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERRO: npm nao encontrado.
  echo Reinstale o Node.js marcando a opcao npm.
  pause
  exit /b
)

npm install

echo.
echo ===============================================
echo  INSTALACAO FINALIZADA
echo ===============================================
echo.
echo Agora execute: INICIAR_SERVIDOR.bat
echo.
pause
