#!/usr/bin/env python3
"""Resize bandcamp artwork images to a max width of 400px, preserving aspect ratio."""

from pathlib import Path
from PIL import Image

MAX_WIDTH = 400

ARTWORK_DIRS = [
    Path(__file__).parent.parent / "public" / "bandcamp_artwork",
    Path(__file__).parent.parent / "src" / "programs" / "woodlandfortress" / "bandcamp_artwork",
]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def shrink_image(path: Path) -> None:
    try:
        img = Image.open(path)
    except Exception as e:
        print(f"  SKIP {path.name}: {e}")
        return
    with img:
        w, h = img.size
        if w <= MAX_WIDTH:
            return
        new_w = MAX_WIDTH
        new_h = round(h * MAX_WIDTH / w)
        resized = img.resize((new_w, new_h), Image.LANCZOS)
        # JPEG doesn't support alpha; flatten onto white background
        if path.suffix.lower() in {".jpg", ".jpeg"} and resized.mode in {"RGBA", "LA", "P"}:
            bg = Image.new("RGB", resized.size, (255, 255, 255))
            bg.paste(resized, mask=resized.split()[-1] if resized.mode in {"RGBA", "LA"} else None)
            resized = bg
        resized.save(path)
        print(f"  {path.relative_to(Path(__file__).parent.parent)}  {w}x{h} -> {new_w}x{new_h}")


def main() -> None:
    total = 0
    for artwork_dir in ARTWORK_DIRS:
        if not artwork_dir.exists():
            continue
        for img_path in sorted(artwork_dir.rglob("*")):
            if img_path.suffix.lower() in IMAGE_EXTENSIONS and img_path.is_file():
                shrink_image(img_path)
                total += 1
    print(f"\nDone. Checked {total} images.")


if __name__ == "__main__":
    main()




