@echo off
title Fix Ryfields Gym Netlify Link
cd /d "%~dp0.."
if not exist ".netlify" mkdir ".netlify"
> ".netlify\state.json" echo {"siteId":"7b4fbe44-7b8e-4d93-b127-d12fe473e60f"}
echo.
echo SUCCESS - this Ryfields Gym folder is linked to the existing Netlify project.
echo No new Netlify project was created.
echo.
pause
