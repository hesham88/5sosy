"""YouTube playlist crawler (additive, standalone module).

Expands each `videos.{youtubeUrl}` playlist into an `items[]` array stored on the
same MongoDB `videos` doc, so the player can offer playlist -> individual-video
navigation. Pure logic lives in `crawl_playlists`; it is invoked both by the
`/v1/videos/crawl-playlists` service endpoint (runs on Cloud Run, which is the
Atlas-whitelisted host) and via `python playlist_crawler.py` for local runs.

Requires env `YOUTUBE_API_KEY` (YouTube Data API v3) and Mongo access.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

PLAYLIST_ITEMS_API = "https://www.googleapis.com/youtube/v3/playlistItems"


def extract_playlist_id(url: str | None) -> str | None:
    """Pull the `list=` playlist id out of any YouTube URL form
    (watch?v=..&list=, playlist?list=, embed/videoseries?list=)."""
    if not url:
        return None
    try:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    except Exception:
        return None
    vals = params.get("list")
    return vals[0] if vals else None


def fetch_playlist_items(playlist_id: str, api_key: str, max_items: int = 200) -> list[dict]:
    """Page through the playlist (50/page) and return a flat list of items."""
    items: list[dict] = []
    page_token: str | None = None
    while len(items) < max_items:
        query = {
            "part": "snippet",
            "playlistId": playlist_id,
            "maxResults": 50,
            "key": api_key,
        }
        if page_token:
            query["pageToken"] = page_token
        url = f"{PLAYLIST_ITEMS_API}?{urllib.parse.urlencode(query)}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for it in data.get("items", []):
            snippet = it.get("snippet", {}) or {}
            video_id = (snippet.get("resourceId", {}) or {}).get("videoId")
            if not video_id:
                continue
            thumbs = snippet.get("thumbnails", {}) or {}
            thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url", "")
            items.append({
                "videoId": video_id,
                "title": snippet.get("title", ""),
                "position": snippet.get("position", len(items)),
                "thumbnail": thumb,
            })
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return items


def crawl_playlists(api_key: str, db, *, dry_run: bool = False, limit: int | None = None) -> dict:
    """Crawl every videos doc whose youtubeUrl is a playlist; write items[]."""
    scanned = 0
    updated = 0
    total_items = 0
    errors: list[str] = []
    details: list[dict] = []

    for doc in db["videos"].find({}, {"youtubeUrl": 1, "title": 1}):
        playlist_id = extract_playlist_id(doc.get("youtubeUrl"))
        if not playlist_id:
            continue
        if limit is not None and scanned >= limit:
            break
        scanned += 1
        try:
            items = fetch_playlist_items(playlist_id, api_key)
        except Exception as e:
            msg = f"{doc.get('_id')}: {e}"
            errors.append(msg)
            print(f"  ! crawl failed for {msg}")
            continue
        total_items += len(items)
        details.append({"id": str(doc.get("_id")), "playlistId": playlist_id, "count": len(items)})
        print(f"  {str(doc.get('title', '?'))[:40]} [{playlist_id}] -> {len(items)} items")
        if not dry_run:
            db["videos"].update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "items": items,
                    "playlistId": playlist_id,
                    "itemsUpdatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }},
            )
            updated += 1

    return {
        "status": "ok",
        "scanned": scanned,
        "updated": updated,
        "total_items": total_items,
        "errors": errors,
        "details": details,
        "dry_run": dry_run,
    }


def main() -> None:
    import os
    import sys
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except Exception:
        pass
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        print("ERROR: YOUTUBE_API_KEY not set")
        sys.exit(1)
    dry = "--dry-run" in sys.argv
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    from shared.mongodb_client import get_mongodb_client
    _, db = get_mongodb_client()
    result = crawl_playlists(api_key, db, dry_run=dry, limit=limit)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
