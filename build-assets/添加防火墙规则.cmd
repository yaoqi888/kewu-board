@echo off
setlocal
set PORT=5080
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo Please right-click this file and choose "Run as administrator".
  echo This script adds a Windows Firewall inbound rule for TCP %PORT%.
  echo.
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="KewuBoard 5080" >nul 2>&1
netsh advfirewall firewall add rule name="KewuBoard 5080" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain
if errorlevel 1 (
  echo.
  echo Failed to add the firewall rule.
  echo Please add TCP %PORT% inbound manually in Windows Defender Firewall.
  echo.
  pause
  exit /b 1
)
echo.
echo Firewall rule added: TCP %PORT% inbound, private/domain networks.
echo Other computers can now access this server on the LAN.
echo.
pause
