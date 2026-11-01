# -*- coding: utf-8 -*-
"""把站点 favicon.svg 转成多尺寸 favicon.ico（给 Windows 快捷方式当图标用）。

用法：
    python tools/make_ico.py            # 读 ../favicon.svg → tools/favicon.ico
    python tools/make_ico.py --size 512 # 自定义基准尺寸

只支持 favicon 常用的基本图形：<circle> / <ellipse> + 纯色填充 + 一个
objectBoundingBox 的 radialGradient。遇到别的元素会跳过并提示。
SVG 改了直接重跑本脚本即可。
"""
import argparse
import os
import sys
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "favicon.svg")
OUT = os.path.join(REPO, "tools", "favicon.ico")
ICO_SIZES = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
NS = "{http://www.w3.org/2000/svg}"


def tag(el):
    return el.tag.replace(NS, "")


def parse_color(value):
    """支持 #rgb / #rrggbb / 常见色名。"""
    named = {"white": "#ffffff", "black": "#000000", "none": None}
    v = (value or "").strip().lower()
    v = named.get(v, v)
    if not v:
        return None
    if v.startswith("#"):
        h = v[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 6:
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
    return None


def find_gradient(root, gid):
    for el in root.iter():
        if tag(el) == "radialGradient" and el.get("id") == gid:
            stops = []
            for s in el:
                if tag(s) == "stop":
                    stops.append((float(s.get("offset", 0)),
                                  parse_color(s.get("stop-color", ""))))
            return {"cx": float(el.get("cx", 0.5)),
                    "cy": float(el.get("cy", 0.5)),
                    "r": float(el.get("r", 0.5)),
                    "stops": [x for x in stops if x[1]]}
    return None


def radial_layer(size, bbox, grad):
    """按 objectBoundingBox 语义生成一块径向渐变，返回 (RGBA 图, mask)。"""
    import numpy as np
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    gcx, gcy, gr = x0 + grad["cx"] * w, y0 + grad["cy"] * h, grad["r"] * max(w, h)
    yy, xx = np.mgrid[0:size, 0:size].astype("float32")
    t = np.clip(np.sqrt((xx - gcx) ** 2 + (yy - gcy) ** 2) / max(gr, 1e-6), 0, 1)

    stops = grad["stops"]
    rgb = np.zeros((size, size, 3), "float32")
    for i in range(len(stops) - 1):
        o0, c0 = stops[i]
        o1, c1 = stops[i + 1]
        band = (t >= o0) & (t <= o1)
        if not band.any():
            continue
        k = ((t - o0) / max(o1 - o0, 1e-6))[band][:, None]
        rgb[band] = np.array(c0[:3], "float32") + k * (
            np.array(c1[:3], "float32") - np.array(c0[:3], "float32"))
    if stops:
        rgb[t <= stops[0][0]] = stops[0][1][:3]
        rgb[t >= stops[-1][0]] = stops[-1][1][:3]
    return Image.fromarray(rgb.astype("uint8"), "RGB").convert("RGBA")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=1024, help="绘制基准尺寸（超采样）")
    ap.add_argument("--src", default=SRC)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    if not os.path.exists(args.src):
        sys.exit("找不到 %s" % args.src)

    root = ET.parse(args.src).getroot()
    vb = (root.get("viewBox") or "0 0 64 64").replace(",", " ").split()
    vx, vy, vw, vh = (float(x) for x in vb[:4])
    scale = args.size / max(vw, vh)

    def sx(v):
        return (float(v) - vx) * scale

    img = Image.new("RGBA", (args.size, args.size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    drawn = 0

    for el in root:
        t = tag(el)
        if t not in ("circle", "ellipse"):
            continue
        if t == "circle":
            cx, cy, r = float(el.get("cx", 0)), float(el.get("cy", 0)), float(el.get("r", 0))
            box = (cx - r, cy - r, cx + r, cy + r)
        else:
            cx, cy = float(el.get("cx", 0)), float(el.get("cy", 0))
            rx, ry = float(el.get("rx", 0)), float(el.get("ry", 0))
            box = (cx - rx, cy - ry, cx + rx, cy + ry)

        bbox = (sx(box[0]), sx(box[1]), sx(box[2]), sx(box[3]))
        fill = el.get("fill", "#000000")

        if fill.startswith("url(#"):
            grad = find_gradient(root, fill[5:-1])
            if not grad:
                print("！跳过 %s：找不到渐变 %s" % (t, fill))
                continue
            layer = radial_layer(args.size, bbox, grad)
            mask = Image.new("L", (args.size, args.size), 0)
            ImageDraw.Draw(mask).ellipse(bbox, fill=255)
            img.paste(layer, (0, 0), mask)
        else:
            color = parse_color(fill)
            if not color:
                continue
            draw.ellipse(bbox, fill=color)
        drawn += 1

    print("绘制 %d 个图形，基准 %dpx" % (drawn, args.size))
    # Pillow 9.1+ 把 LANCZOS 挪进 Image.Resampling，老版本没有 Resampling
    resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
    base = img.resize((256, 256), resample)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    base.save(args.out, format="ICO", sizes=ICO_SIZES)
    print("→ %s  (%.1f KB, %d 个尺寸)" % (
        args.out, os.path.getsize(args.out) / 1024, len(ICO_SIZES)))


if __name__ == "__main__":
    main()
