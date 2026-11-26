"""Optimize large deck photos: uv run --with pillow==13.0.0 python scripts/optimize-visual-assets.py.

Run after fetch-visual-assets.py. Keep the current decks' subjects, attribution,
normalized crop positions and aspect ratios. Originals are backed up locally in
.cache/visual-originals; only smaller WebP variants are shipped.
"""
import json
import shutil
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
DECKS = ("skyrot", "skylinerot", "zoomrot")
MIN_BYTES = 500_000
MAX_WIDTH = 1000
QUALITY = 85


def main():
    before = after = count = 0
    for game in DECKS:
        deck = ROOT / f"dist/games/data/{game}.json"
        rows = json.loads(deck.read_text())
        changed = False
        retired = []
        for row in rows:
            source = ROOT / "dist" / row["image"].lstrip("/")
            size = source.stat().st_size
            if source.suffix.lower() not in (".jpg", ".jpeg", ".png") or size < MIN_BYTES:
                continue
            destination = source.with_suffix(".webp")
            if destination.exists():
                raise FileExistsError(destination)
            with Image.open(source) as original:
                image = ImageOps.exif_transpose(original).convert("RGB")
                if image.width > MAX_WIDTH:
                    height = round(image.height * MAX_WIDTH / image.width)
                    image = image.resize((MAX_WIDTH, height), Image.Resampling.LANCZOS)
                encoded = BytesIO()
                image.save(encoded, "WEBP", quality=QUALITY, method=6,
                           icc_profile=original.info.get("icc_profile", b""))
            content = encoded.getvalue()
            if len(content) >= size:
                continue
            backup = ROOT / ".cache/visual-originals" / source.name
            backup.parent.mkdir(parents=True, exist_ok=True)
            if backup.exists() and source.read_bytes() != backup.read_bytes():
                raise FileExistsError(f"Original backup differs: {backup}")
            if not backup.exists():
                shutil.copy2(source, backup)
            destination.write_bytes(content)
            row["image"] = "/" + destination.relative_to(ROOT / "dist").as_posix()
            before += size
            after += len(content)
            count += 1
            changed = True
            retired.append(source)
            print(f"{source.name}: {size:,} → {len(content):,} bytes; {image.width}×{image.height}")
        if changed:
            deck.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n")
            # Publish the complete deck before retiring its original files.
            for source in retired:
                source.unlink()
    print(f"{count} photos: {before:,} → {after:,} bytes")


if __name__ == "__main__":
    main()
