@echo off
title Ver portas seriais - Painel Supervisorio
cd /d "%~dp0"

echo ===============================================
echo  PORTAS SERIAIS DISPONIVEIS
echo ===============================================
echo.

node -e "const { SerialPort } = require('serialport'); SerialPort.list().then(ports => { if(!ports.length){ console.log('Nenhuma porta encontrada.'); return; } ports.forEach(p => console.log((p.path || '') + ' - ' + (p.manufacturer || p.friendlyName || ''))); }).catch(err => console.error(err.message));"

echo.
pause
