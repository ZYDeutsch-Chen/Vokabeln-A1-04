#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
德语A1词汇卡片 - 本地服务器启动脚本
使用Python内置的http.server模块启动本地服务器
"""

import http.server
import socketserver
import webbrowser
import sys
import os

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """自定义HTTP请求处理器，添加CORS支持"""
    
    def end_headers(self):
        # 添加CORS头，允许跨域请求
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()
    
    def log_message(self, format, *args):
        """自定义日志输出"""
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    """主函数"""
    # 切换到脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print("=" * 50)
    print("  德语A1词汇卡片 - 本地服务器")
    print("=" * 50)
    print()
    print(f"服务器地址: http://localhost:{PORT}")
    print(f"请在浏览器中打开: http://localhost:{PORT}/A1.html")
    print()
    print("按 Ctrl+C 停止服务器")
    print()
    
    try:
        # 创建服务器
        with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
            # 尝试自动打开浏览器
            try:
                url = f"http://localhost:{PORT}/A1.html"
                print(f"正在尝试自动打开浏览器: {url}")
                webbrowser.open(url)
            except Exception as e:
                print(f"无法自动打开浏览器: {e}")
                print("请手动在浏览器中打开上述地址")
            
            print()
            print("服务器已启动，等待请求...")
            print("-" * 50)
            
            # 启动服务器
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print()
        print()
        print("服务器已停止")
        sys.exit(0)
    except OSError as e:
        if e.errno == 10048:  # Windows: 端口已被占用
            print(f"错误: 端口 {PORT} 已被占用")
            print("请关闭占用该端口的程序，或修改脚本中的PORT变量")
        else:
            print(f"错误: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"发生错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

