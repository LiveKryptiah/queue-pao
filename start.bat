@echo off
title Provincial Assessor's Office - Queue Management System
echo =========================================================================
echo   PROVINCIAL ASSESSOR'S OFFICE - QUEUE MANAGEMENT SYSTEM
echo   Full-Stack Real Web Application (Flask + SQLite + SSE)
echo =========================================================================
echo.
echo   * Starting Web Server on http://localhost:8000 ...
echo   * Access Links:
echo     - Kiosk & Console:  http://localhost:8000/
echo     - Public TV Board:  http://localhost:8000/tv.html
echo     - Mobile Tracker:   http://localhost:8000/track.html
echo.
echo   Press Ctrl+C to stop the server at any time.
echo =========================================================================
echo.
python server.py
pause
