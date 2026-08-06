import json, pathlib

p = pathlib.Path(r"C:\Users\snowb\Programs\mcdev\mcdev\src\programs\woodlandfortress\bandcamp_data.json")
with open(p, encoding="utf-8") as f:
    data = json.load(f)

for band in data.values():
    if band.get("artist_image"):
        v = band["artist_image"].replace("\\", "/")
        if not v.startswith("/"):
            v = "/" + v
        band["artist_image"] = v
    for album in band.get("albums", []):
        if album.get("artwork"):
            v = album["artwork"].replace("\\", "/")
            if not v.startswith("/"):
                v = "/" + v
            album["artwork"] = v

with open(p, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print("done")
