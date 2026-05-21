"""Video Extractor Agent — scrapes video metadata from ellibrary.moe.gov.eg/video/books.json."""
from __future__ import annotations

import httpx
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any
from google.cloud import firestore

class VideoExtractorAgent:
    def __init__(self, db: firestore.Client, url: str = "https://ellibrary.moe.gov.eg/video/books.json"):
        self.db = db
        self.url = url
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }

    def _generate_video_id(self, youtube_url: str) -> str:
        return hashlib.md5(youtube_url.encode("utf-8")).hexdigest()[:16]

    async def run(self) -> List[Dict[str, Any]]:
        """Fetch video metadata and save to Firestore 'videos' collection."""
        print(f"[VideoExtractor] Fetching videos catalog from {self.url}...")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(self.url, headers=self.headers, follow_redirects=True)
                if res.status_code != 200:
                    raise ValueError(f"HTTP {res.status_code} when fetching video catalog")
                data = res.json()
        except Exception as e:
            print(f"[VideoExtractor] Failed to fetch video catalog: {e}")
            return []

        videos_processed = []
        videos_coll = self.db.collection("videos")

        print(f"[VideoExtractor] Processing {len(data)} video items...")
        for item in data:
            youtube_url = item.get("link", "").strip()
            if not youtube_url:
                continue

            v_id = self._generate_video_id(youtube_url)
            subject = item.get("subject", "General").strip()
            grade = item.get("grade", "General").strip()
            title = f"{subject} - {grade}" if subject and grade else (subject or grade or "Educational Video")

            video_doc = {
                "id": v_id,
                "title": title,
                "stage": item.get("stage", "").strip(),
                "grade": grade,
                "subject": subject,
                "term": item.get("term", "").strip(),
                "youtubeUrl": youtube_url,
                "sourceUrl": "https://ellibrary.moe.gov.eg/video/",
                "createdAt": firestore.SERVER_TIMESTAMP
            }

            try:
                # Write to Firestore
                videos_coll.document(v_id).set(video_doc)
                videos_processed.append(video_doc)
            except Exception as e:
                print(f"[VideoExtractor] Failed to save video doc {v_id} ({title}): {e}")

        print(f"[VideoExtractor] Successfully saved {len(videos_processed)} videos to Firestore.")
        return videos_processed
