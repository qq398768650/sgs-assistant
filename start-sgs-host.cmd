@echo off
chcp 65001 >nul
title SGS Assistant userscript host :8100
cd /d "%~dp0"

echo.
echo   三国杀助手 · userscript 托管服务
echo   ----------------------------------------
echo   安装页 : http://127.0.0.1:8100/
echo   脚本源 : http://127.0.0.1:8100/sgs-assistant.user.js
echo.
echo   保持此窗口开着，Tampermonkey 才能检查更新。
echo   关闭窗口即停止服务（已安装的脚本不受影响）。
echo.

node "%~dp0serve-sgs.mjs"

echo.
echo   服务已停止。
pause
