@echo off
chcp 65001 >nul
echo ========================================
echo   德语A1词汇卡片 - 本地服务器启动
echo ========================================
echo.

REM 检查Python是否安装
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [√] 检测到Python，使用Python服务器
    echo.
    echo 服务器地址: http://localhost:8000
    echo 请在浏览器中打开: http://localhost:8000/A1.html
    echo.
    echo 按 Ctrl+C 停止服务器
    echo.
    python -m http.server 8000
    goto :end
)

REM 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [√] 检测到Node.js，使用Node.js服务器
    echo.
    echo 正在检查http-server模块...
    npx --yes http-server -p 8000 -o /A1.html
    goto :end
)

echo [×] 未检测到Python或Node.js
echo.
echo 请选择以下方式之一：
echo 1. 安装Python: https://www.python.org/downloads/
echo 2. 安装Node.js: https://nodejs.org/
echo.
pause

:end

