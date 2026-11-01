"""带 Range 支持的本地静态服务器（python -m http.server 不支持断点/跳转，音频拖不动）。

用法：
    python tools/serve.py [端口]          # 默认服务仓库根目录
    python tools/serve.py [端口] [目录]   # 指定目录
"""
import http.server
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        rng = self.headers.get("Range")
        if not rng or os.path.isdir(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng.strip())
        if not m or (not m.group(1) and not m.group(2)):
            return super().send_head()
        try:
            size = os.path.getsize(path)
        except OSError:
            return super().send_head()
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2)))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self._range = (start, end)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        rng = getattr(self, "_range", None)
        if not rng:
            return super().copyfile(source, outputfile)
        start, end = rng
        self._range = None
        left = end - start + 1
        while left > 0:
            chunk = source.read(min(64 * 1024, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--open"]
    want_open = "--open" in sys.argv[1:]
    port = int(args[0]) if args else 8765
    root = args[1] if len(args) > 1 else REPO
    os.chdir(root)
    url = "http://127.0.0.1:%d/" % port
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError as e:
        print("端口 %d 起不来：%s" % (port, e))
        print("可能已经有一个在跑，或换个端口：python tools/serve.py 8766")
        sys.exit(1)
    print("serving %s" % root)
    print("→ %s  (Ctrl+C 停止)" % url)
    if want_open:
        import threading
        import webbrowser
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
