"""Crawler & Scraper Agent — discovers all books and PDFs on ellibrary.moe.gov.eg."""
from __future__ import annotations

import httpx
import re
import urllib.parse
import json
from typing import List, Dict, Any

BLACKLIST_SUBSTRINGS = [
    "madrasetnaplus.eg",
    "me-portal.qureo.education",
    "stream.moe.gov.eg",
    "talk_arabic"
]

class CrawlerAgent:
    def __init__(self, base_url: str = "https://ellibrary.moe.gov.eg/"):
        self.base_url = base_url
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }

    def _is_blacklisted(self, url: str) -> bool:
        if not url:
            return True
        for substring in BLACKLIST_SUBSTRINGS:
            if substring in url:
                return True
        return False

    def _clean_and_resolve_url(self, link: str, parent_url: str) -> str:
        # Strip whitespace, newlines, etc.
        cleaned = link.strip().replace(" ", "").replace("\n", "").replace("\r", "")
        # Resolve relative URLs
        absolute_url = urllib.parse.urljoin(parent_url, cleaned)
        # Fix potential double pdf extensions
        if absolute_url.lower().endswith(".pdf.pdf"):
            absolute_url = absolute_url[:-4]
        return absolute_url

    async def crawl_directory(self, dir_path: str) -> List[Dict[str, Any]]:
        url = urllib.parse.urljoin(self.base_url, dir_path)
        items = []

        # 1. Try to fetch books.json
        json_url = urllib.parse.urljoin(url, "books.json")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(json_url, headers=self.headers, follow_redirects=True)
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, list):
                        for item in data:
                            link = item.get("link")
                            if not link:
                                continue
                            resolved_link = self._clean_and_resolve_url(link, url)
                            if self._is_blacklisted(resolved_link):
                                continue
                            items.append({
                                "stage": item.get("stage", "").strip(),
                                "grade": item.get("grade", "").strip(),
                                "term": item.get("term", "").strip(),
                                "subject": item.get("subject", "").strip(),
                                "type": item.get("type", "").strip(),
                                "link": resolved_link,
                                "source_dir": dir_path
                            })
                        print(f"[Crawler] Directory {dir_path}: Found {len(items)} items in books.json")
                        return items
        except Exception as e:
            print(f"[Crawler] failed to fetch books.json from {json_url}: {e}")

        # 2. Fallback: Parse index HTML for infoCards list or links
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(url, headers=self.headers, follow_redirects=True)
                if res.status_code == 200:
                    text = res.text
                    # Look for infoCards variable in JS
                    m = re.search(r'const\s+infoCards\s*=\s*(\[.*?\]);', text, re.DOTALL)
                    if m:
                        js_array = m.group(1)
                        # Extract title, text, link, linkText using regex
                        matches = re.findall(
                            r'\{\s*title:\s*"(.*?)",\s*text:\s*"(.*?)",\s*link:\s*"(.*?)",\s*linkText:\s*"(.*?)"\s*\}',
                            js_array
                        )
                        for match in matches:
                            title, body, link, link_text = match
                            resolved_link = self._clean_and_resolve_url(link, url)
                            if self._is_blacklisted(resolved_link):
                                continue
                            # If it's a sub-directory, we will visit it, but if it ends with .pdf, it's a book
                            if resolved_link.lower().endswith(".pdf"):
                                items.append({
                                    "stage": dir_path.strip("/"),
                                    "grade": "General",
                                    "term": "General",
                                    "subject": title.replace("🎓", "").strip(),
                                    "type": link_text.strip(),
                                    "link": resolved_link,
                                    "source_dir": dir_path
                                })
                        print(f"[Crawler] Directory {dir_path}: Found {len(items)} PDF items in HTML infoCards")
        except Exception as e:
            print(f"[Crawler] failed to parse HTML for {url}: {e}")

        return items

    async def run(self) -> List[Dict[str, Any]]:
        """Run crawling over all known curriculum/book directories."""
        directories = [
            "books/",
            "sec3guideforms/",
            "fany3guideforms/",
            "ExamSpecifications/",
            "cha/",
            "fany_Exam_time_date/"
        ]
        
        all_books = []
        seen_links = set()

        for directory in directories:
            print(f"[Crawler] Crawling directory: {directory}")
            items = await self.crawl_directory(directory)
            for item in items:
                link = item["link"]
                if link not in seen_links:
                    seen_links.add(link)
                    all_books.append(item)
                    
        print(f"[Crawler] Finished crawling. Total unique books found: {len(all_books)}")
        return all_books
