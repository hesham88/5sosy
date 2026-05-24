"""Tools for the AskMe Agent."""
from __future__ import annotations
import math
import os
from google import genai
from shared.mongodb_client import get_mongodb_client

def dot_product(v1, v2):
    return sum(x * y for x, y in zip(v1, v2))

def magnitude(v):
    return math.sqrt(sum(x * x for x in v))

def cosine_similarity(v1, v2):
    mag1 = magnitude(v1)
    mag2 = magnitude(v2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot_product(v1, v2) / (mag1 * mag2)

async def search_library(query: str, limit: int = 5) -> dict:
    """Search the textbook library for pages relevant to the query.
    
    Tries to perform a semantic vector search over textbook page contents in MongoDB.
    If no vector search index is available, falls back to in-memory cosine similarity,
    and then to keyword matching.
    
    Args:
        query: The natural language search query or keywords.
        limit: Max number of pages to return.
        
    Returns:
        On success: {"status": "success", "results": [...]}
        On error: {"status": "error", "error_message": "..."}
    """
    if not query.strip():
        return {"status": "success", "results": []}
    
    try:
        _, mongo_db = get_mongodb_client()
        # 1. Generate the query embedding
        client = genai.Client()
        response = await client.aio.models.embed_content(
            model="models/gemini-embedding-2",
            contents=query
        )
        embs = response.embeddings
        if not embs or not embs[0].values:
            raise ValueError("Failed to get query embedding")
        query_emb = list(embs[0].values)
        
        results = []
        # Fetch page records
        docs = list(mongo_db["book_pages"].find({}))
        for data in docs:
            text = data.get("text", "")
            # Check embedding
            emb_list = data.get("embedding")
            score = 0.0
            if emb_list and len(emb_list) == len(query_emb):
                score = cosine_similarity(query_emb, emb_list)
            else:
                # regex text search fallback if embedding is missing or doesn't match dimensions
                if query.lower() in text.lower():
                    score = 0.5  # middle score for keyword match fallback
            
            if score > 0.15:
                results.append({
                    "bookId": data.get("bookId"),
                    "bookTitle": data.get("bookTitle", "Unknown Book"),
                    "pageNumber": data.get("pageNumber"),
                    "text": text[:500] + "..." if len(text) > 500 else text,
                    "grade": data.get("grade", ""),
                    "subject": data.get("subject", ""),
                    "language": data.get("language", "ar"),
                    "year": data.get("year", 2026),
                    "score": round(score, 4)
                })
        
        results.sort(key=lambda x: x["score"], reverse=True)
        results = results[:limit]
        return {"status": "success", "results": results}
        
    except Exception as exc:
        # Fall back to pure text regex/substring search on MongoDB if anything goes wrong (e.g. Gemini key missing or DB connection)
        try:
            _, mongo_db = get_mongodb_client()
            docs = list(mongo_db["book_pages"].find({}))
            results = []
            for data in docs:
                text = data.get("text", "")
                if query.lower() in text.lower():
                    results.append({
                        "bookId": data.get("bookId"),
                        "bookTitle": data.get("bookTitle", "Unknown Book"),
                        "pageNumber": data.get("pageNumber"),
                        "text": text[:500] + "..." if len(text) > 500 else text,
                        "grade": data.get("grade", ""),
                        "subject": data.get("subject", ""),
                        "language": data.get("language", "ar"),
                        "year": data.get("year", 2026),
                        "score": 0.5
                    })
            results = results[:limit]
            return {"status": "success", "results": results}
        except Exception as inner_exc:
            return {"status": "error", "error_message": f"Search failed: {inner_exc} (Embedding err: {exc})"}
