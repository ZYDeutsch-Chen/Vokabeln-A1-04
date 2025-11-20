# 德语A1词汇卡片 - 本地服务器启动脚本 (PowerShell)
# 使用Python或Node.js启动本地服务器

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  德语A1词汇卡片 - 本地服务器启动" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$port = 8000

# 检查Python
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[√] 检测到Python: $pythonVersion" -ForegroundColor Green
        Write-Host ""
        Write-Host "服务器地址: http://localhost:$port" -ForegroundColor Yellow
        Write-Host "请在浏览器中打开: http://localhost:$port/A1.html" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
        Write-Host ""
        
        # 启动Python服务器
        python -m http.server $port
        exit
    }
} catch {
    # Python未安装或不在PATH中
}

# 检查Node.js
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[√] 检测到Node.js: $nodeVersion" -ForegroundColor Green
        Write-Host ""
        Write-Host "正在检查http-server模块..." -ForegroundColor Yellow
        Write-Host "服务器地址: http://localhost:$port" -ForegroundColor Yellow
        Write-Host "请在浏览器中打开: http://localhost:$port/A1.html" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
        Write-Host ""
        
        # 启动Node.js服务器
        npx --yes http-server -p $port -o /A1.html
        exit
    }
} catch {
    # Node.js未安装或不在PATH中
}

# 如果都没有安装
Write-Host "[×] 未检测到Python或Node.js" -ForegroundColor Red
Write-Host ""
Write-Host "请选择以下方式之一：" -ForegroundColor Yellow
Write-Host "1. 安装Python: https://www.python.org/downloads/" -ForegroundColor Cyan
Write-Host "2. 安装Node.js: https://nodejs.org/" -ForegroundColor Cyan
Write-Host ""
Read-Host "按Enter键退出"

