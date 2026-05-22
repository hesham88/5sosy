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

    def _is_school_education(self, item: Dict[str, Any]) -> bool:
        stage = item.get("stage", "").strip()
        grade = item.get("grade", "").strip()
        subject = item.get("subject", "").strip()
        source_dir = item.get("source_dir", "").strip()
        link = item.get("link", "").strip()
        
        # Textual indicators for kindergarten / preschool and community education
        exclude_patterns = [
            r'\bkg\b',
            r'kindergarten',
            r'رياض[\s_]الاطفال',
            r'رياض[\s_]الأطفال',
            r'مستوى[\s_]أول',
            r'مستوي[\s_]أول',
            r'مستوى[\s_]ثان',
            r'مستوي[\s_]ثان',
            r'تمهيدي',
            r'\bkg1\b',
            r'\bkg2\b',
            r'تعليم[\s_]مجتمعي',
            r'تعليم[\s_]المجتمع',
            r'community[\s_]education'
        ]
        
        combined_text = f"{stage} {grade} {subject} {source_dir} {link}".lower()
        for pattern in exclude_patterns:
            if re.search(pattern, combined_text):
                return False
                
        return True

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
                            candidate = {
                                "stage": item.get("stage", "").strip(),
                                "grade": item.get("grade", "").strip(),
                                "term": item.get("term", "").strip(),
                                "subject": item.get("subject", "").strip(),
                                "type": item.get("type", "").strip(),
                                "link": resolved_link,
                                "source_dir": dir_path
                            }
                            if not self._is_school_education(candidate):
                                continue
                            items.append(candidate)
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
                                candidate = {
                                    "stage": dir_path.strip("/"),
                                    "grade": "General",
                                    "term": "General",
                                    "subject": title.replace("🎓", "").strip(),
                                    "type": link_text.strip(),
                                    "link": resolved_link,
                                    "source_dir": dir_path
                                }
                                if self._is_school_education(candidate):
                                    items.append(candidate)
                        print(f"[Crawler] Directory {dir_path}: Found {len(items)} PDF items in HTML infoCards")
        except Exception as e:
            print(f"[Crawler] failed to parse HTML for {url}: {e}")

        return items

    async def run(self) -> List[Dict[str, Any]]:
        """Run crawling over all known curriculum/book directories."""
        directories = [
            "sec3guideforms/",
            "ExamSpecifications/",
            "cha/",
            "books/"
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
        
        if not all_books:
            print("[Crawler] Online crawling returned 0 items. Falling back to local crawler_books_fallback.json...")
            import os
            fallback_path = os.path.join(os.path.dirname(__file__), "crawler_books_fallback.json")
            if os.path.exists(fallback_path):
                try:
                    with open(fallback_path, "r", encoding="utf-8") as f:
                        fallback_data = json.load(f)
                    # Filter fallback items to only include target directories
                    for item in fallback_data:
                        link = item.get("link")
                        s_dir = item.get("source_dir")
                        if link and s_dir in directories and link not in seen_links:
                            if not self._is_school_education(item):
                                continue
                            seen_links.add(link)
                            all_books.append(item)
                    print(f"[Crawler] Successfully loaded and filtered {len(all_books)} books from fallback file.")
                except Exception as e:
                    print(f"[Crawler] Failed to load fallback file: {e}")
                    
        return all_books
