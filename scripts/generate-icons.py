#!/usr/bin/env python3
"""生成 Header Master 的图标（16/48/128 PNG）。

设计：圆角方块底（主色 #1a73e8）+ 白色几何「H」。
4x 超采样后 LANCZOS 降采样，保证小尺寸下圆角与笔画清晰。
依赖：Pillow。用法：python3 scripts/generate-icons.py
"""
import os
from PIL import Image, ImageDraw

ACCENT = (26, 115, 232, 255)   # #1a73e8
WHITE = (255, 255, 255, 255)
SS = 4  # 超采样倍数
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")


def draw_icon(s):
    """在 s×s 画布上绘制图标（不含超采样）。"""
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角方块背景，铺满画布
    radius = round(s * 0.22)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=ACCENT)

    # 几何「H」：两根竖条 + 一根横条
    margin = round(s * 0.26)
    thick = max(round(s * 0.16), 1)
    cy = s / 2

    # 左竖条
    d.rectangle((margin, margin, margin + thick, s - margin), fill=WHITE)
    # 右竖条
    d.rectangle((s - margin - thick, margin, s - margin, s - margin), fill=WHITE)
    # 横梁
    d.rectangle(
        (margin + thick, cy - thick / 2, s - margin - thick, cy + thick / 2),
        fill=WHITE,
    )
    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (16, 48, 128):
        big = draw_icon(size * SS)
        icon = big.resize((size, size), Image.LANCZOS)
        path = os.path.join(OUT_DIR, f"{size}.png")
        icon.save(path, "PNG")
        print(f"wrote {os.path.relpath(path)} ({size}x{size})")


if __name__ == "__main__":
    main()
