@echo off
title Ryfields Gym - Netlify Setup and Deployment
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP-AND-DEPLOY-NETLIFY.ps1"
echo.
if errorlevel 1 echo SETUP DID NOT COMPLETE. Leave this window open and tell Codex what it says.
pause
