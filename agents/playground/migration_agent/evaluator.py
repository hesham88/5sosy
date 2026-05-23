from __future__ import annotations

from typing import Dict, Any, List
from google.cloud import firestore
from pymongo.database import Database

class MigrationEvaluator:
    def __init__(self, db: firestore.Client, mongo_db: Database):
        self.db = db
        self.mongo_db = mongo_db

    def evaluate_migration(self) -> Dict[str, Any]:
        """Perform evaluation of migrated data from Firestore to MongoDB."""
        stats = {
            "passed": True,
            "details": [],
            "firestore_counts": {},
            "mongodb_counts": {}
        }
        
        # 1. Evaluate flat collections
        flat_collections = ["subjects", "textbooks", "chapters", "concepts", "quizQuestions", "videos"]
        for col in flat_collections:
            fs_count = len(list(self.db.collection(col).stream()))
            mg_count = self.mongo_db[col].count_documents({})
            
            stats["firestore_counts"][col] = fs_count
            stats["mongodb_counts"][col] = mg_count
            
            if fs_count != mg_count:
                stats["passed"] = False
                stats["details"].append(f"Count mismatch in {col}: Firestore={fs_count}, MongoDB={mg_count}")
            else:
                stats["details"].append(f"Collection {col} verified: {fs_count} documents.")
                
        # 2. Evaluate books and nested collections
        fs_books = len(list(self.db.collection("books").stream()))
        mg_books = self.mongo_db["books"].count_documents({})
        stats["firestore_counts"]["books"] = fs_books
        stats["mongodb_counts"]["books"] = mg_books
        
        if fs_books != mg_books:
            stats["passed"] = False
            stats["details"].append(f"Count mismatch in books: Firestore={fs_books}, MongoDB={mg_books}")
        else:
            stats["details"].append(f"Collection books verified: {fs_books} documents.")
            
        # Count subcollection pages (via collection group in Firestore)
        fs_pages = len(list(self.db.collection_group("pages").stream()))
        mg_pages = self.mongo_db["book_pages"].count_documents({})
        stats["firestore_counts"]["book_pages"] = fs_pages
        stats["mongodb_counts"]["book_pages"] = mg_pages
        
        if fs_pages != mg_pages:
            stats["passed"] = False
            stats["details"].append(f"Count mismatch in book_pages: Firestore={fs_pages}, MongoDB={mg_pages}")
        else:
            stats["details"].append(f"Collection book_pages verified: {fs_pages} documents.")
            
        # Count subcollection content
        fs_content = len(list(self.db.collection_group("content").stream()))
        mg_content = self.mongo_db["book_contents"].count_documents({})
        stats["firestore_counts"]["book_contents"] = fs_content
        stats["mongodb_counts"]["book_contents"] = mg_content
        
        if fs_content != mg_content:
            stats["passed"] = False
            stats["details"].append(f"Count mismatch in book_contents: Firestore={fs_content}, MongoDB={mg_content}")
        else:
            stats["details"].append(f"Collection book_contents verified: {fs_content} documents.")
            
        # 3. Evaluate users and nested collections
        fs_users = len(list(self.db.collection("users").stream()))
        mg_users = self.mongo_db["users"].count_documents({})
        stats["firestore_counts"]["users"] = fs_users
        stats["mongodb_counts"]["users"] = mg_users
        
        if fs_users != mg_users:
            stats["passed"] = False
            stats["details"].append(f"Count mismatch in users: Firestore={fs_users}, MongoDB={mg_users}")
        else:
            stats["details"].append(f"Collection users verified: {fs_users} documents.")
            
        user_subcols = {
            "studyPlans": "user_studyPlans",
            "sessions": "user_sessions",
            "quizAttempts": "user_quizAttempts",
            "mastery": "user_mastery",
            "activity": "user_activity",
            "customBooks": "user_customBooks"
        }
        
        for fs_sub, mg_col in user_subcols.items():
            fs_count = len(list(self.db.collection_group(fs_sub).stream()))
            mg_count = self.mongo_db[mg_col].count_documents({})
            stats["firestore_counts"][mg_col] = fs_count
            stats["mongodb_counts"][mg_col] = mg_count
            
            if fs_count != mg_count:
                stats["passed"] = False
                stats["details"].append(f"Count mismatch in {mg_col}: Firestore={fs_count}, MongoDB={mg_count}")
            else:
                stats["details"].append(f"Collection {mg_col} verified: {fs_count} documents.")
                
        # 4. Smoke test query
        try:
            sample_book = self.mongo_db["books"].find_one()
            if sample_book:
                stats["details"].append(f"Smoke test query passed: Read sample book '{sample_book.get('title')}' successfully.")
            else:
                if fs_books > 0:
                    stats["passed"] = False
                    stats["details"].append("Smoke test query warning: No book document found in MongoDB even though books existed in Firestore.")
                else:
                    stats["details"].append("Smoke test query passed (empty database).")
        except Exception as e:
            stats["passed"] = False
            stats["details"].append(f"Smoke test query failed: {e}")
            
        return stats
