import asyncio
import json
import os
import re
from typing import List, Dict, Any

from ingestion_agent.crawler import CrawlerAgent

def is_kindergarten(item: Dict[str, Any]) -> bool:
    stage = item.get("stage", "").strip()
    grade = item.get("grade", "").strip()
    subject = item.get("subject", "").strip()
    source_dir = item.get("source_dir", "").strip()
    link = item.get("link", "").strip()
    
    # Textual indicators for kindergarten / preschool
    kg_patterns = [
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
        r'\bkg2\b'
    ]
    
    combined_text = f"{stage} {grade} {subject} {source_dir} {link}".lower()
    for pattern in kg_patterns:
        if re.search(pattern, combined_text):
            return True
            
    return False

async def main():
    crawler = CrawlerAgent()
    print("Starting crawler to fetch all PDFs from the target MOE library paths...")
    all_books = await crawler.run()
    
    print("\n--- Crawler Results & Analysis ---")
    print(f"Total unique books found initially: {len(all_books)}")
    
    # Let's count by stage
    stages = {}
    kg_books = []
    kept_books = []
    
    for book in all_books:
        stage = book.get("stage") or "Unknown Stage"
        grade = book.get("grade") or "Unknown Grade"
        
        stages[stage] = stages.get(stage, 0) + 1
        
        if is_kindergarten(book):
            kg_books.append(book)
        else:
            kept_books.append(book)
            
    print("\nInitial books by 'stage' attribute:")
    for stage, count in stages.items():
        print(f"  - {stage}: {count}")
        
    print(f"\nKindergarten books identified for exclusion ({len(kg_books)}):")
    for idx, book in enumerate(kg_books, 1):
        print(f"  {idx}. Stage: {book.get('stage')}, Grade: {book.get('grade')}, Subject: {book.get('subject')}, Link: {book.get('link')}")
        
    print("\nRemaining books by stage after excluding Kindergarten:")
    kept_stages = {}
    for book in kept_books:
        stage = book.get("stage") or "Unknown Stage"
        kept_stages[stage] = kept_stages.get(stage, 0) + 1
    for stage, count in kept_stages.items():
        print(f"  - {stage}: {count}")
        
    print(f"\nSummary Forecast:")
    print(f"  Total unique PDFs BEFORE filtering: {len(all_books)}")
    print(f"  Total unique PDFs AFTER smart filtering (excluding Kindergarten): {len(kept_books)}")
    print(f"  Reduction: {len(kg_books)} PDFs excluded.")

if __name__ == "__main__":
    asyncio.run(main())
