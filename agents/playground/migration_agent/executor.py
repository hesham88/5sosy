from __future__ import annotations

import struct
from typing import Callable, Any, Dict, List
from google.cloud import firestore
from pymongo.database import Database

# Reusable function to transform Firestore timestamps/types to BSON-compatible types
def convert_value(val: Any) -> Any:
    if isinstance(val, firestore.SERVER_TIMESTAMP.__class__):
        # Fallback or let MongoDB handle timestamping
        return None
    if hasattr(val, "timestamp") and callable(getattr(val, "timestamp")):
        # Firestore Timestamp
        return val.timestamp() * 1000  # convert to ms timestamp
    if isinstance(val, dict):
        return {k: convert_value(v) for k, v in val.items()}
    if isinstance(val, list):
        return [convert_value(item) for item in val]
    return val

class MigrationExecutor:
    def __init__(self, db: firestore.Client, mongo_db: Database, progress_callback: Callable[[str, float], None]):
        self.db = db
        self.mongo_db = mongo_db
        self.progress_callback = progress_callback

    def run_migration(self, reset: bool = False) -> Dict[str, Any]:
        """Execute the migration of all collections."""
        results = {}
        
        if reset:
            self.progress_callback("Wiping existing MongoDB collections...", 0.0)
            self._wipe_mongodb()

        flat_collections = ["subjects", "textbooks", "chapters", "concepts", "quizQuestions", "videos", "ingestion"]
        
        # 1. Migrate flat collections
        total_steps = len(flat_collections) + 2  # flat collections + books + users
        step_weight = 100.0 / total_steps
        current_progress = 0.0
        
        for idx, col in enumerate(flat_collections):
            self.progress_callback(f"Migrating flat collection: {col}...", current_progress)
            count = self._migrate_flat_collection(col)
            results[col] = count
            current_progress += step_weight
            
        # 2. Migrate books and subcollections
        self.progress_callback("Migrating books, book pages, and book contents...", current_progress)
        book_counts = self._migrate_books()
        results.update(book_counts)
        current_progress += step_weight
        
        # 3. Migrate users and subcollections
        self.progress_callback("Migrating users and user study plans, sessions, mastery, activity...", current_progress)
        user_counts = self._migrate_users()
        results.update(user_counts)
        
        self.progress_callback("Migration execution phase complete.", 100.0)
        return results

    def _wipe_mongodb(self):
        """Wipe all relevant target collections in MongoDB."""
        cols_to_wipe = [
            "subjects", "textbooks", "chapters", "concepts", "quizQuestions", "videos", "ingestion",
            "books", "book_pages", "book_contents", "users",
            "user_studyPlans", "user_sessions", "user_quizAttempts", "user_mastery", "user_activity", "user_customBooks"
        ]
        for col in cols_to_wipe:
            self.mongo_db[col].delete_many({})

    def _migrate_flat_collection(self, name: str) -> int:
        """Migrate a flat Firestore collection to a flat MongoDB collection."""
        fs_col = self.db.collection(name)
        docs = list(fs_col.stream())
        
        if not docs:
            return 0
            
        records = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["_id"] = doc.id
            data = convert_value(data)
            records.append(data)
            
        # Upsert into MongoDB
        mongo_col = self.mongo_db[name]
        for rec in records:
            mongo_col.replace_one({"_id": rec["_id"]}, rec, upsert=True)
            
        return len(records)

    def _migrate_books(self) -> Dict[str, int]:
        """Migrate books, books/{id}/content/full, and books/{id}/pages/{pageId} to MongoDB."""
        books_col = self.db.collection("books")
        books_docs = list(books_col.stream())
        
        books_count = 0
        pages_count = 0
        contents_count = 0
        
        for idx, book_doc in enumerate(books_docs):
            book_id = book_doc.id
            book_data = book_doc.to_dict() or {}
            book_data["_id"] = book_id
            book_data = convert_value(book_data)
            
            # Upsert main book
            self.mongo_db["books"].replace_one({"_id": book_id}, book_data, upsert=True)
            books_count += 1
            
            # Subcollection content
            content_docs = list(books_col.document(book_id).collection("content").stream())
            for c_doc in content_docs:
                c_data = c_doc.to_dict() or {}
                # Create flat schema
                c_data["_id"] = f"{book_id}_{c_doc.id}"
                c_data["bookId"] = book_id
                c_data = convert_value(c_data)
                self.mongo_db["book_contents"].replace_one({"_id": c_data["_id"]}, c_data, upsert=True)
                contents_count += 1
                
            # Subcollection pages
            page_docs = list(books_col.document(book_id).collection("pages").stream())
            for p_doc in page_docs:
                p_data = p_doc.to_dict() or {}
                
                # Convert embedding bytes/lists to direct lists in MongoDB or keep binary
                # Firestore pages sometimes store embedding as packed binary floats.
                # In MongoDB, we can store them as an array of floats so that they can be easily queried or indexed.
                if "embedding" in p_data and isinstance(p_data["embedding"], bytes):
                    emb_bytes = p_data["embedding"]
                    num_floats = len(emb_bytes) // 4
                    emb_list = list(struct.unpack(f"{num_floats}f", emb_bytes))
                    p_data["embedding"] = emb_list
                
                p_data["_id"] = f"{book_id}_{p_doc.id}"
                p_data["bookId"] = book_id
                p_data = convert_value(p_data)
                self.mongo_db["book_pages"].replace_one({"_id": p_data["_id"]}, p_data, upsert=True)
                pages_count += 1
                
            # Periodically report minor progress
            if idx % 10 == 0:
                self.progress_callback(f"Migrated book {idx+1}/{len(books_docs)}: {book_data.get('title')}", -1.0)
                
        return {
            "books": books_count,
            "book_pages": pages_count,
            "book_contents": contents_count
        }

    def _migrate_users(self) -> Dict[str, int]:
        """Migrate users and their subcollections: studyPlans, sessions, quizAttempts, mastery, activity, customBooks."""
        users_col = self.db.collection("users")
        user_docs = list(users_col.stream())
        
        users_count = 0
        sub_counts = {
            "user_studyPlans": 0,
            "user_sessions": 0,
            "user_quizAttempts": 0,
            "user_mastery": 0,
            "user_activity": 0,
            "user_customBooks": 0
        }
        
        user_subcols = {
            "studyPlans": "user_studyPlans",
            "sessions": "user_sessions",
            "quizAttempts": "user_quizAttempts",
            "mastery": "user_mastery",
            "activity": "user_activity",
            "customBooks": "user_customBooks"
        }
        
        for idx, user_doc in enumerate(user_docs):
            uid = user_doc.id
            user_data = user_doc.to_dict() or {}
            user_data["_id"] = uid
            user_data = convert_value(user_data)
            
            # Upsert main user doc
            self.mongo_db["users"].replace_one({"_id": uid}, user_data, upsert=True)
            users_count += 1
            
            # Subcollections
            for sub_name, mongo_col_name in user_subcols.items():
                sub_docs = list(users_col.document(uid).collection(sub_name).stream())
                for s_doc in sub_docs:
                    s_data = s_doc.to_dict() or {}
                    s_data["_id"] = f"{uid}_{s_doc.id}"
                    s_data["userId"] = uid
                    s_data = convert_value(s_data)
                    self.mongo_db[mongo_col_name].replace_one({"_id": s_data["_id"]}, s_data, upsert=True)
                    sub_counts[mongo_col_name] += 1
                    
            if idx % 20 == 0:
                self.progress_callback(f"Migrated user {idx+1}/{len(user_docs)}: {user_data.get('displayName')}", -1.0)
                
        results = {"users": users_count}
        results.update(sub_counts)
        return results
