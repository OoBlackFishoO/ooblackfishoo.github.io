# -*- coding: utf-8 -*-
"""静态站点本地链接自检：解析每个 HTML 的 href/src，解析成磁盘路径后检查是否存在。

用法：
    python tools/linkcheck.py          # 检查仓库根
    python tools/linkcheck.py <目录>   # 检查指定目录
"""
import os
import re
import sys
from urllib.parse import unquote

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))
ATTR = re.compile(r'(?:href|src)\s*=\s*["\']([^"\']+)["\']', re.I)
CSS_URL = re.compile(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', re.I)
COMMENT = re.compile(r'<!--.*?-->', re.S)
CODE = re.compile(r'<(code|pre)\b[^>]*>.*?</\1>', re.S | re.I)
DATA_URI = re.compile(r'url\(\s*["\']?data:[^)]*\)', re.I)


def scrub(html):
    """去掉注释、示例代码块和内联 data URI，避免把示例文本当成真实引用。"""
    html = COMMENT.sub("", html)
    html = CODE.sub("", html)
    return DATA_URI.sub("", html)


def ignore(u):
    return (not u) or u.startswith(("#", "http://", "https://", "//",
                                   "mailto:", "javascript:", "data:"))


def check(page, ref):
    ref = ref.split("#")[0].split("?")[0]
    if not ref:
        return None
    if ref.startswith("/"):
        target = os.path.join(ROOT, ref.lstrip("/"))
    else:
        target = os.path.join(os.path.dirname(page), unquote(ref))
    target = os.path.normpath(target)
    return None if os.path.exists(target) else (ref, target)


def main():
    pages, bad = [], []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if not d.startswith((".", "node_modules"))]
        for f in files:
            if f.lower().endswith(".html"):
                pages.append(os.path.join(base, f))

    for page in pages:
        with open(page, encoding="utf-8", errors="ignore") as fh:
            html = fh.read()
        clean = scrub(html)
        for ref in ATTR.findall(clean):
            if ignore(ref):
                continue
            miss = check(page, ref)
            if miss:
                bad.append((os.path.relpath(page, ROOT), miss[0]))

        # CSS 内的 url(...) 也检查一遍
        for ref in CSS_URL.findall(clean):
            if ignore(ref):
                continue
            miss = check(page, ref)
            if miss:
                bad.append((os.path.relpath(page, ROOT), miss[0]))

    css = os.path.join(ROOT, "css", "style.css")
    if os.path.exists(css):
        with open(css, encoding="utf-8", errors="ignore") as fh:
            for ref in CSS_URL.findall(DATA_URI.sub("", fh.read())):
                if ignore(ref):
                    continue
                miss = check(css, ref)
                if miss:
                    bad.append(("css/style.css", miss[0]))

    print("HTML 页面数：%d" % len(pages))
    if bad:
        print("发现 %d 处失效引用：" % len(bad))
        seen = set()
        for page, ref in bad:
            key = (page, ref)
            if key in seen:
                continue
            seen.add(key)
            print("  %-42s -> %s" % (page, ref))
        return 1

    print("全部本地引用有效（0 处失效）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
