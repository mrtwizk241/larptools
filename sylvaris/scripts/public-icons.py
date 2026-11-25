"""Build the plain PWA icons for the public site (docs/PUBLIC-SITE-PLAN.md): no Sylvaris logo or
site art, just the letters "SY" in the app's header colors.

Run: .venv/Scripts/python.exe scripts/public-icons.py  (needs Pillow; uses Windows Arial Bold)
Writes public-site/icons/. vite.public.config.ts serves public-site/ instead of public/.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public-site" / "icons"
FONT = Path("C:/Windows/Fonts/arialbd.ttf")
BG = (0x17, 0x16, 0x1A)  # --color-header-bg
TEXT = (0xF5, 0xF5, 0xF5)  # --color-header-text
ACCENT = (0xF8, 0x9B, 0x1C)  # --color-focus (Nightfall)


def icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)
    # Maskable icons keep the mark inside the middle 80% safe zone.
    scale = 0.7 if maskable else 0.9
    inset = round(size * (1 - scale) / 2)
    width = max(2, round(size * 0.035))
    draw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=round(size * 0.12 * scale),
        outline=ACCENT,
        width=width,
    )
    font = ImageFont.truetype(str(FONT), round(size * 0.36 * scale))
    draw.text((size / 2, size / 2), "SY", fill=TEXT, font=font, anchor="mm")
    return img


OUT.mkdir(parents=True, exist_ok=True)
icon(192).save(OUT / "icon-192.png", optimize=True)
icon(512).save(OUT / "icon-512.png", optimize=True)
icon(512, maskable=True).save(OUT / "icon-maskable-512.png", optimize=True)
icon(180).save(OUT / "apple-touch-icon-180.png", optimize=True)
print("Wrote", ", ".join(sorted(p.name for p in OUT.iterdir())))
