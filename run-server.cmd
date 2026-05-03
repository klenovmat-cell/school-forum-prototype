@echo off
set "PATH=%CD%\node-v24.15.0-win-x64;%PATH%"
call "%CD%\node-v24.15.0-win-x64\npm.cmd" run dev -w server
