"""Generates every favicon, app icon and in-app brand mark from packages/tokens/brand/trackrex-mark.png.

Run from the repository root after changing the master logo: python3 infra/scripts/brand-assets.py (needs Pillow).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / 'packages/tokens/brand/trackrex-mark.png'
WHITE = (255, 255, 255, 255)

src = Image.open(MASTER).convert('RGBA')
mark = src.crop(src.split()[3].getbbox())


def fit(size: int, pad: float = 0.0, bg=None, img: Image.Image = mark) -> Image.Image:
    """The mark centred on a square canvas, `pad` being the margin on each side as a fraction of `size`."""
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    box = max(1, round(size * (1 - 2 * pad)))
    scale = box / max(img.size)
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    canvas.alpha_composite(img.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return canvas


def save(img: Image.Image, rel: str, **kw) -> None:
    out = ROOT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True, **kw)
    print(rel)


for appdir in ('apps/web', 'apps/platform', 'apps/site'):
    save(fit(48, 0.02), f'{appdir}/src/app/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    save(fit(512, 0.04), f'{appdir}/src/app/icon.png')
    save(fit(180, 0.12, WHITE), f'{appdir}/src/app/apple-icon.png')
    save(fit(256), f'{appdir}/public/brand/trackrex-mark.png')
    save(fit(192, 0.1, WHITE), f'{appdir}/public/brand/icon-192.png')
    save(fit(512, 0.1, WHITE), f'{appdir}/public/brand/icon-512.png')
    save(fit(512, 0.2, WHITE), f'{appdir}/public/brand/icon-maskable-512.png')

def lockup_card(width: int, height: int) -> Image.Image:
    """Mark, four-colour wordmark and tagline, centred: the same lockup as the Wordmark component."""
    fonts = ROOT / 'apps/mobile/assets/fonts'
    size = round(height * 0.2)
    word = ImageFont.truetype(str(fonts / 'google-sans-wordmark.ttf'), size)
    tag_size = round(size * 0.36)
    tag = ImageFont.truetype(str(fonts / 'google-sans-tagline.ttf'), tag_size)
    colors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853']
    name, tagline = 'Trackrex', 'Track It Easy'
    word_w = sum(word.getlength(c) for c in name) - 0.04 * size * (len(name) - 1)
    mark_h = round(size * 1.5)
    mark_img = fit(mark_h)
    gap = round(size * 0.3)
    total_w = mark_h + gap + word_w
    x0, y0 = (width - total_w) / 2, (height - mark_h) / 2
    card = Image.new('RGBA', (width, height), WHITE)
    card.alpha_composite(mark_img, (round(x0), round(y0)))
    d = ImageDraw.Draw(card)
    x, top = x0 + mark_h + gap, y0 + mark_h * 0.08
    for i, c in enumerate(name):
        d.text((x, top), c, font=word, fill=colors[i % 4])
        x += word.getlength(c) - 0.04 * size
    x, ty = x0 + mark_h + gap + 0.1 * tag_size, top + size * 1.12
    for c in tagline:
        d.text((x, ty), c, font=tag, fill='#52606D')
        x += tag.getlength(c) + 0.08 * tag_size
    return card


save(lockup_card(1200, 630).convert('RGB'), 'apps/site/src/app/opengraph-image.png')

# Expo: Android keeps a 66 % safe zone in adaptive icons, so the foreground mark stays inside it.
save(fit(1024, 0.12, WHITE), 'apps/mobile/assets/images/icon.png')
save(fit(512, 0.22), 'apps/mobile/assets/images/android-icon-foreground.png')
save(Image.new('RGBA', (512, 512), WHITE), 'apps/mobile/assets/images/android-icon-background.png')
silhouette = Image.new('RGBA', mark.size, WHITE)
silhouette.putalpha(mark.split()[3])
save(fit(432, 0.22, img=silhouette), 'apps/mobile/assets/images/android-icon-monochrome.png')
save(fit(256), 'apps/mobile/assets/images/splash-icon.png')
save(fit(48, 0.02), 'apps/mobile/assets/images/favicon.png')

for size in (16, 32, 48, 128):
    save(fit(size, 0.02), f'apps/extension/icons/icon-{size}.png')

save(fit(512, 0.06), 'apps/desktop/src/renderer/icon.png')
save(fit(16), 'apps/desktop/src/renderer/tray.png')
save(fit(32), 'apps/desktop/src/renderer/tray@2x.png')
