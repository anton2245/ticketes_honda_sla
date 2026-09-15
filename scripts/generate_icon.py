import os
import math
from PIL import Image, ImageDraw, ImageFilter

def create_honda_icon():
    size = 512
    # Base canvas
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    bg_margin = 28
    bg_radius = 92
    
    # 1. Soft ambient shadow behind app icon
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        [bg_margin + 4, bg_margin + 16, size - bg_margin - 4, size - bg_margin + 20],
        radius=bg_radius,
        fill=(0, 0, 0, 160)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    img.alpha_composite(shadow)

    # 2. Rich Honda Red Gradient Background
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    
    for y in range(bg_margin, size - bg_margin):
        factor = (y - bg_margin) / float(size - 2 * bg_margin)
        # Gradient: Vibrant crimson (#e11d48 / #dc2626) to dark luxury burgundy (#7f1d1d)
        r = int(225 * (1 - factor) + 120 * factor)
        g = int(29 * (1 - factor) + 12 * factor)
        b = int(48 * (1 - factor) + 24 * factor)
        bg_draw.line([(bg_margin, y), (size - bg_margin, y)], fill=(r, g, b, 255))
        
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        [bg_margin, bg_margin, size - bg_margin, size - bg_margin],
        radius=bg_radius,
        fill=255
    )
    img.paste(bg, (0, 0), mask)

    # 3. Outer subtle metallic border
    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border)
    border_draw.rounded_rectangle(
        [bg_margin, bg_margin, size - bg_margin, size - bg_margin],
        radius=bg_radius,
        outline=(255, 255, 255, 75),
        width=3
    )
    img.alpha_composite(border)

    # 4. Draw Official Honda Chrome Emblem using super-sampling for pristine anti-aliasing
    # Work on 4x scale (2048x2048) then downsample with LANCZOS
    s = 4
    hires_size = size * s
    hires = Image.new("RGBA", (hires_size, hires_size), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(hires)

    # Coordinates in 4x space (center at 1024, 1024)
    # The official Honda badge consists of:
    # Outer trapezoid frame with curved corners, and the classic flared H inside.
    
    # Outer chrome rounded frame:
    # Top width: ~1300, Bottom width: ~1100, Height: ~1200
    outer_pts = [
        (380, 420),   # Top Left
        (1668, 420),  # Top Right
        (1520, 1640), # Bottom Right
        (528, 1640)   # Bottom Left
    ]

    inner_pts = [
        (510, 540),   # Top Left
        (1538, 540),  # Top Right
        (1408, 1520), # Bottom Right
        (640, 1520)   # Bottom Left
    ]

    # Draw Chrome Frame
    hdraw.polygon(outer_pts, fill=(255, 255, 255, 255))
    hdraw.polygon(inner_pts, fill=(0, 0, 0, 0))

    # The Honda "H":
    # Left pillar: starts wide at top, slants slightly inward, curves outward at base
    left_pillar = [
        (570, 540),
        (780, 540),
        (760, 1520),
        (640, 1520),
    ]

    # Right pillar:
    right_pillar = [
        (1268, 540),
        (1478, 540),
        (1408, 1520),
        (1288, 1520),
    ]

    # Horizontal crossbar (located slightly below center):
    crossbar = [
        (750, 1020),
        (1298, 1020),
        (1294, 1180),
        (754, 1180),
    ]

    hdraw.polygon(left_pillar, fill=(255, 255, 255, 255))
    hdraw.polygon(right_pillar, fill=(255, 255, 255, 255))
    hdraw.polygon(crossbar, fill=(255, 255, 255, 255))

    # Downsample emblem for anti-aliasing
    emblem = hires.resize((size, size), Image.Resampling.LANCZOS)

    # 5. Add 3D chrome drop shadow under emblem
    emblem_shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    emblem_shadow.paste((0, 0, 0, 110), mask=emblem.split()[3])
    emblem_shadow = emblem_shadow.filter(ImageFilter.GaussianBlur(8))
    
    img.alpha_composite(emblem_shadow, (0, 4))
    img.alpha_composite(emblem)

    # 6. Elegant top reflection glass highlight
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    gloss_draw.ellipse([-40, -120, size + 40, int(size * 0.58)], fill=(255, 255, 255, 38))
    img.paste(Image.alpha_composite(img, gloss), (0, 0), mask)

    # Output paths
    png_path = "electron/icon.png"
    ico_path = "electron/icon.ico"
    public_png_path = "public/img/logo.png"

    img.save(png_path, "PNG")
    img.save(public_png_path, "PNG")

    # Windows ICO multi-resolution bundle
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(ico_path, format="ICO", sizes=icon_sizes)

    print("Successfully generated official Honda emblem icons.")

if __name__ == "__main__":
    create_honda_icon()
