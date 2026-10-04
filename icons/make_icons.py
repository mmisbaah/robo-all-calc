"""Generate PNG app icons (192, 512, maskable) matching the SVG design."""
from PIL import Image, ImageDraw

BG1 = (102, 126, 234)   # #667eea
BG2 = (118, 75, 162)    # #764ba2
CARD = (30, 30, 46)     # #1e1e2e
PANEL = (22, 22, 31)    # #16161f
KEY = (45, 45, 68)      # #2d2d44
KEY2 = (61, 61, 92)     # #3d3d5c
ACCENT = (102, 126, 234)
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_icon(size, maskable=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    # Diagonal gradient background
    grad = Image.new('RGB', (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = lerp(BG1, BG2, t)
    # Rounded-rect clip (maskable keeps a full-bleed background)
    if maskable:
        bg = grad.convert('RGBA')
        img.paste(bg, (0, 0))
        scale = 0.72  # safe area
    else:
        mask = rounded_rect_mask(size, int(size * 96 / 512))
        img.paste(grad.convert('RGBA'), (0, 0), mask)
        scale = 1.0

    d = ImageDraw.Draw(img)

    def S(v):  # scale SVG coords (512 canvas) to output size
        return v * size / 512 * scale + (size * (1 - scale) / 2 if maskable else 0)

    def R(v):
        return int(v * size / 512 * scale)

    # Card body
    card = [S(116), S(88), S(396), S(424)]
    d.rounded_rectangle(card, radius=R(32), fill=CARD + (255,))

    # Display
    disp = [S(148), S(120), S(364), S(196)]
    d.rounded_rectangle(disp, radius=R(16), fill=PANEL + (255,))

    # Keypad grid
    for row in range(3):
        for col in range(3):
            x0 = S(148 + col * 56)
            y0 = S(224 + row * 56)
            d.rounded_rectangle([x0, y0, x0 + R(44), y0 + R(44)], radius=R(10), fill=KEY + (255,))
    # Right operator column
    for row in range(3):
        x0 = S(320)
        y0 = S(224 + row * 56)
        color = ACCENT if row == 2 else KEY2
        d.rounded_rectangle([x0, y0, x0 + R(44), y0 + R(44)], radius=R(10), fill=color + (255,))

    # Simple "42" on the display using rectangles (7-seg-ish)
    dw = R(6)  # stroke width

    def seg(x, y, w, h, on=True):
        if on:
            d.rectangle([x, y, x + w, y + h], fill=WHITE + (255,))

    # digit "4"
    bx, by, s = int(S(300)), int(S(132)), R(14)
    seg(bx, by, dw, s)          # left vertical top
    seg(bx, by + s, s, dw)      # middle bar
    seg(bx + s - dw, by, dw, 2 * s)  # right vertical

    # digit "2"
    bx2 = int(S(330))
    seg(bx2, by, s, dw)         # top bar
    seg(bx2 + s - dw, by, dw, s)  # upper-right
    seg(bx2, by + s, s, dw)     # middle bar
    seg(bx2, by + s, dw, s)     # lower-left
    seg(bx2, by + 2 * s, s, dw) # bottom bar

    return img


if __name__ == '__main__':
    import os
    out = os.path.dirname(os.path.abspath(__file__))
    make_icon(192).save(os.path.join(out, 'icon-192.png'))
    make_icon(512).save(os.path.join(out, 'icon-512.png'))
    make_icon(512, maskable=True).save(os.path.join(out, 'icon-maskable-512.png'))
    print('icons written')
