#!/usr/bin/env python3
"""
Scrape Bandcamp artist pages for artwork and album data using Playwright.
Bandcamp serves a JS challenge to plain HTTP clients; Playwright bypasses it.

Saves artwork to <workspace>/public/bandcamp_artwork/ (served as /bandcamp_artwork/ by Vite).
Outputs bandcamp_data.json with web-accessible paths and Bandcamp album IDs.

Usage:
    pip install playwright beautifulsoup4
    playwright install chromium
    python fetch_bandcamp.py
"""

import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, Browser

# Fix Windows console encoding so Unicode prints don't crash
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).parent
JSON_PATH = SCRIPT_DIR / "woodlandfortress.json"
PUBLIC_DIR = SCRIPT_DIR.parents[2] / "public"
ART_DIR = PUBLIC_DIR / "bandcamp_artwork"
OUT_PATH = SCRIPT_DIR / "bandcamp_data.json"
DELAY = 1.0

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) "
        "Gecko/20100101 Firefox/124.0"
    )
}


def full_size_url(url: str) -> str:
    return re.sub(r"_\d+\.(jpg|png|gif|avif)", r"_0.\1", url)


def web_path(dest: Path) -> str:
    return "/" + dest.relative_to(PUBLIC_DIR).as_posix()


def scrape_artist(browser: Browser, url: str) -> dict:
    pg = browser.new_page()
    try:
        pg.goto(url, wait_until="networkidle", timeout=30000)
        html = pg.content()
    finally:
        pg.close()

    soup = BeautifulSoup(html, "html.parser")

    artist_image = None
    bp = soup.select_one("img.band-photo")
    if bp:
        artist_image = full_size_url(bp.get("src", ""))
    if not artist_image:
        og = soup.find("meta", property="og:image")
        if og:
            artist_image = full_size_url(og.get("content", ""))

    bio = soup.select_one("#bio-text")
    description = bio.get_text("\n", strip=True) if bio else None

    base = url.rstrip("/")
    albums = []
    seen: set = set()
    for li in soup.select("li.music-grid-item"):
        a = li.select_one("a")
        if not a:
            continue
        href = a.get("href", "")
        if not href.startswith("http"):
            href = base.rstrip("/") + "/" + href.lstrip("/")
        if href in seen:
            continue
        seen.add(href)
        title_el = li.select_one(".title")
        thumb_el = li.select_one("img")
        albums.append({
            "title": title_el.get_text(strip=True) if title_el else a.get_text(strip=True),
            "url": href,
            "thumb": thumb_el.get("src", "") if thumb_el else "",
        })

    return {"artist_image": artist_image, "albums": albums, "description": description}


def scrape_album(browser: Browser, url: str) -> dict:
    pg = browser.new_page()
    try:
        pg.goto(url, wait_until="networkidle", timeout=30000)
        html = pg.content()
        album_id = None
        try:
            val = pg.evaluate("typeof TralbumData !== 'undefined' ? String(TralbumData.id) : ''")
            if val and val not in ("", "undefined", "null", "0"):
                album_id = val
        except Exception:
            pass
    finally:
        pg.close()

    soup = BeautifulSoup(html, "html.parser")

    release_date = None
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or "")
            if data.get("datePublished"):
                release_date = data["datePublished"]
                break
        except Exception:
            pass

    art_img = soup.select_one(".tralbumArt img") or soup.select_one("#tralbumArt img")
    artwork_url = full_size_url(art_img["src"]) if art_img else None

    about = soup.select_one(".tralbumData.tralbum-about")
    description = about.get_text("\n", strip=True) if about else None

    return {"release_date": release_date, "artwork_url": artwork_url, "album_id": album_id, "description": description}


def safe_filename(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)[:80]


def download(url: str, dest: Path) -> bool:
    if dest.exists():
        return False
    r = requests.get(url, headers=HEADERS, timeout=30, stream=True)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return True


def main():
    with open(JSON_PATH, encoding="utf-8") as f:
        bands = json.load(f)

    # Load existing data â€” only re-scrape what is missing
    existing: dict = {}
    if OUT_PATH.exists():
        with open(OUT_PATH, encoding="utf-8") as f:
            existing = json.load(f)

    ART_DIR.mkdir(parents=True, exist_ok=True)
    results = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for band in bands:
            bc_url = band["links"].get("bandcamp", "").rstrip("/")
            if not bc_url:
                print(f"[skip] {band['name']} -- no Bandcamp URL")
                continue

            band_cache = existing.get(band["id"], {})
            cached_albums = {a["url"]: a for a in band_cache.get("albums", [])}
            artist_dir = ART_DIR / band["id"]
            artist_dir.mkdir(exist_ok=True)

            # Skip artist page if image already downloaded and album list is cached
            existing_img_file = next(artist_dir.glob("artist.*"), None)
            if existing_img_file and cached_albums and band_cache.get("description") is not None:
                print(f"\n- {band['name']}  (using cached album list)")
                artist_img_web = web_path(existing_img_file)
                artist_description = band_cache.get("description")
                raw_albums = [{"url": a["url"], "title": a["title"], "thumb": ""}
                              for a in band_cache["albums"]]
            else:
                print(f"\n> {band['name']}  ({bc_url})")
                try:
                    artist = scrape_artist(browser, bc_url)
                    time.sleep(DELAY)
                except Exception as e:
                    print(f"  ! artist page error: {e}")
                    results[band["id"]] = band_cache
                    continue

                raw_albums = artist["albums"]
                artist_description = artist.get("description")
                artist_img_web = band_cache.get("artist_image")

                if artist["artist_image"]:
                    ext = artist["artist_image"].rsplit(".", 1)[-1].split("?")[0] or "jpg"
                    dest = artist_dir / f"artist.{ext}"
                    try:
                        new = download(artist["artist_image"], dest)
                        print(f"  {'+ photo' if new else '- photo'}")
                        artist_img_web = web_path(dest)
                    except Exception as e:
                        print(f"  ! photo: {e}")

            albums_out = []
            for album in raw_albums:
                cached = cached_albums.get(album["url"], {})

                # Skip album page entirely if we already have all fields
                if cached.get("album_id") and cached.get("artwork") and "description" in cached:
                    albums_out.append(cached)
                    continue

                print(f"  ~ {album['title']}")
                details: dict = {}
                try:
                    details = scrape_album(browser, album["url"])
                    time.sleep(DELAY)
                except Exception as e:
                    print(f"    ! {e}")

                # Artwork: prefer full-size from album page, fall back to grid thumb
                artwork_url = details.get("artwork_url") or (
                    full_size_url(album["thumb"]) if album.get("thumb") else None
                )
                art_web = cached.get("artwork")
                if artwork_url and not art_web:
                    dest = artist_dir / f"{safe_filename(album['title'])}.jpg"
                    try:
                        download(artwork_url, dest)
                        art_web = web_path(dest)
                    except Exception as e:
                        print(f"    ! artwork: {e}")

                album_id = details.get("album_id") or cached.get("album_id")
                if album_id:
                    print(f"    id:{album_id}")

                albums_out.append({
                    "title": album["title"],
                    "url": album["url"],
                    "release_date": details.get("release_date") or cached.get("release_date"),
                    "artwork": art_web,
                    "album_id": album_id,
                    "description": details.get("description") if details else cached.get("description"),
                })

            results[band["id"]] = {"artist_image": artist_img_web, "description": artist_description, "albums": albums_out}

        browser.close()

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nDone -> {OUT_PATH}")


if __name__ == "__main__":
    main()

