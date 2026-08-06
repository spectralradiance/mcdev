"""
Download projects and associated screen caps from a Notion database.

Usage:
    Set NOTION_TOKEN in your environment (or a .env file), then run:
        python download_projects.py

Output:
    public/projects.json      – published project records (web-accessible)
    public/screencaps/        – downloaded image files (web-accessible)
"""

import os
import json
import re
import urllib.request
import urllib.error
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # Fallback: manually parse .env in the script's directory
    _env_path = Path(__file__).parent / ".env"
    if _env_path.exists():
        for _line in _env_path.read_text().splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

# ── Configuration ────────────────────────────────────────────────────────────

NOTION_TOKEN   = os.environ.get("NOTION_TOKEN", "")
DATABASE_ID    = "39d503f4de12806f8f88cfd179409f70"
NOTION_VERSION = "2022-06-28"
OUTPUT_DIR     = Path("public") / "screencaps"
OUTPUT_JSON    = Path("public") / "projects.json"

# ── Helpers ───────────────────────────────────────────────────────────────────

def notion_request(path: str, payload: dict | None = None) -> dict:
    """Make a GET (no payload) or POST (with payload) request to the Notion API."""
    url = f"https://api.notion.com/v1{path}"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }
    data = json.dumps(payload).encode() if payload is not None else None
    method = "POST" if data is not None else "GET"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        raise RuntimeError(f"Notion API error {exc.code}: {body}") from exc


def query_database(database_id: str) -> list[dict]:
    """Retrieve all pages from a Notion database (handles pagination)."""
    pages, cursor = [], None
    while True:
        payload: dict = {}
        if cursor:
            payload["start_cursor"] = cursor
        result = notion_request(f"/databases/{database_id}/query", payload)
        pages.extend(result.get("results", []))
        if not result.get("has_more"):
            break
        cursor = result.get("next_cursor")
    return pages


def get_page_blocks(page_id: str) -> list[dict]:
    """Retrieve all block children for a page (handles pagination)."""
    blocks, cursor = [], None
    while True:
        path = f"/blocks/{page_id}/children"
        if cursor:
            path += f"?start_cursor={cursor}"
        result = notion_request(path)
        blocks.extend(result.get("results", []))
        if not result.get("has_more"):
            break
        cursor = result.get("next_cursor")
    return blocks


def collect_image_urls(blocks: list[dict]) -> list[str]:
    """Pull image URLs out of a list of blocks."""
    urls = []
    for block in blocks:
        if block.get("type") == "image":
            img = block["image"]
            src = img.get("type")
            if src == "external":
                urls.append(img["external"]["url"])
            elif src == "file":
                urls.append(img["file"]["url"])
    return urls


def collect_description(blocks: list[dict]) -> str:
    """Extract plain text from paragraph blocks to form a description."""
    paragraphs = []
    for block in blocks:
        if block.get("type") == "paragraph":
            texts = block["paragraph"].get("rich_text", [])
            text = "".join(t.get("plain_text", "") for t in texts).strip()
            if text:
                paragraphs.append(text)
    return "\n\n".join(paragraphs)


def safe_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip()


def download_file(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as f:
        f.write(resp.read())


def extract_text(prop) -> str:
    """Extract plain text from a Notion rich_text or title property."""
    texts = prop.get("rich_text") or prop.get("title") or []
    return "".join(t.get("plain_text", "") for t in texts)


def extract_property(prop: dict):
    """Return a Python-native value for any common Notion property type."""
    t = prop.get("type")
    if t in ("title", "rich_text"):
        return extract_text(prop)
    if t == "number":
        return prop.get("number")
    if t == "select":
        s = prop.get("select")
        return s["name"] if s else None
    if t == "multi_select":
        return [s["name"] for s in prop.get("multi_select", [])]
    if t == "date":
        d = prop.get("date")
        return d["start"] if d else None
    if t == "checkbox":
        return prop.get("checkbox")
    if t == "url":
        return prop.get("url")
    if t == "email":
        return prop.get("email")
    if t == "phone_number":
        return prop.get("phone_number")
    if t == "files":
        out = []
        for f in prop.get("files", []):
            if f.get("type") == "external":
                out.append(f["external"]["url"])
            elif f.get("type") == "file":
                out.append(f["file"]["url"])
        return out
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not NOTION_TOKEN:
        raise SystemExit(
            "NOTION_TOKEN is not set.\n"
            "Create a Notion integration at https://www.notion.so/my-integrations, "
            "share the database with it, then set the token:\n"
            "    set NOTION_TOKEN=secret_..."
        )

    OUTPUT_DIR.mkdir(exist_ok=True)
    print(f"Querying database {DATABASE_ID} …")
    pages = query_database(DATABASE_ID)
    print(f"  Found {len(pages)} project(s).")

    projects = []

    for page in pages:
        props = page.get("properties", {})
        publish = ""
        for v in props.values():
            if v.get("type") == "select" and extract_property(v) == "Yes":
                # check if this is the publish field by key name
                pass
        publish_val = ""
        for k, v in props.items():
            if "publish" in k.lower() or "mcdev" in k.lower():
                publish_val = extract_property(v) or ""
                break
        if publish_val != "Yes":
            continue

        project: dict = {
            "id":         page["id"],
            "url":        page.get("url"),
            "properties": {k: extract_property(v) for k, v in props.items()},
            "description": "",
            "screencaps": [],
        }

        # Derive a display name for console output / file naming
        name = ""
        for k, v in props.items():
            if v.get("type") == "title":
                name = extract_text(v)
                break
        name = name or page["id"]

        print(f"  Processing: {name}")

        # Collect images from the page's cover
        cover = page.get("cover")
        cover_urls: list[str] = []
        if cover:
            if cover.get("type") == "external":
                cover_urls.append(cover["external"]["url"])
            elif cover.get("type") == "file":
                cover_urls.append(cover["file"]["url"])

        # Collect images and description from inline blocks
        blocks = get_page_blocks(page["id"])
        block_image_urls = collect_image_urls(blocks)
        desc_from_blocks = collect_description(blocks)
        project["description"] = project["properties"].get("Overview") or desc_from_blocks

        # Also collect file-type properties (often used for screen caps)
        file_prop_urls: list[str] = []
        for v in props.values():
            if v.get("type") == "files":
                file_prop_urls.extend(extract_property(v) or [])

        all_image_urls = cover_urls + file_prop_urls + block_image_urls

        safe_name = safe_filename(name)
        for idx, img_url in enumerate(all_image_urls, 1):
            ext = img_url.split("?")[0].rsplit(".", 1)[-1].lower() or "jpg"
            if ext not in ("jpg", "jpeg", "png", "gif", "webp", "svg"):
                ext = "jpg"
            filename = f"{safe_name}_{idx}.{ext}"
            dest = OUTPUT_DIR / filename
            try:
                download_file(img_url, dest)
                # Store as a web-accessible URL path (forward slashes)
                project["screencaps"].append(f"/screencaps/{filename}")
                print(f"    Downloaded: {dest}")
            except Exception as exc:
                print(f"    Warning – could not download {img_url}: {exc}")

        projects.append(project)

    OUTPUT_JSON.write_text(json.dumps(projects, indent=2, ensure_ascii=False))
    print(f"\nSaved {len(projects)} published project(s) to {OUTPUT_JSON}")
    print(f"Screen caps saved to {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
