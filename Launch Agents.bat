@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_agents.ps1" -StartDir "%CD%"
