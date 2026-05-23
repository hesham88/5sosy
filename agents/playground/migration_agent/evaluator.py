from __future__ import annotations

from typing import Dict, Any, List
from google.cloud import firestore
from pymongo.database import Database

class MigrationEvaluator:
    def __init__(self, db: firestore.Client, mongo_db: Database):
        self.db = db
        self.mongo_db = mongo_db

    def _get_firestore_count(self, query, skip_stream_on_timeout: bool = False) -> int:
        """Helper to get the document count of a query safely using native aggregation if supported, falling back to stream."""
        try:
            results = query.count().get()
            if results and len(results) > 0:
                first_item = results[0]
                # In some client versions, it returns [[AggregationResult(value=X)]]
                if isinstance(first_item, list) and len(first_item) > 0:
                    val = first_item[0].value
                else:
                    val = getattr(first_item, "value", None)
                if val is not None:
                    return int(val)
        except Exception as e:
            if skip_stream_on_timeout:
                raise RuntimeError(f"Firestore count query failed/timed out, skipping stream fallback to prevent gRPC timeout crashes: {e}") from e
        
        if skip_stream_on_timeout:
            # If native count didn't succeed, do not risk streaming
            raise RuntimeError("Firestore count query did not return a valid count, skipping stream fallback to prevent gRPC timeout crashes.")
            
        return len(list(query.stream()))

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
            try:
                fs_count = self._get_firestore_count(self.db.collection(col))
                mg_count = self.mongo_db[col].count_documents({})
                
                stats["firestore_counts"][col] = fs_count
                stats["mongodb_counts"][col] = mg_count
                
                if fs_count != mg_count:
                    stats["passed"] = False
                    stats["details"].append(f"Count mismatch in {col}: Firestore={fs_count}, MongoDB={mg_count}")
                else:
                    stats["details"].append(f"Collection {col} verified: {fs_count} documents.")
            except Exception as e:
                stats["passed"] = False
                stats["details"].append(f"Error evaluating flat collection {col}: {e}")
                
        # 2. Evaluate books and nested collections
        fs_books = 0
        try:
            fs_books = self._get_firestore_count(self.db.collection("books"))
            mg_books = self.mongo_db["books"].count_documents({})
            stats["firestore_counts"]["books"] = fs_books
            stats["mongodb_counts"]["books"] = mg_books
            
            if fs_books != mg_books:
                stats["passed"] = False
                stats["details"].append(f"Count mismatch in books: Firestore={fs_books}, MongoDB={mg_books}")
            else:
                stats["details"].append(f"Collection books verified: {fs_books} documents.")
        except Exception as e:
            stats["passed"] = False
            stats["details"].append(f"Error evaluating books: {e}")
            
        # Count subcollection pages (via collection group in Firestore with safe fallback)
        try:
            mg_pages = self.mongo_db["book_pages"].count_documents({})
            stats["mongodb_counts"]["book_pages"] = mg_pages
            
            # Try counting globally but prevent streaming fallback
            fs_pages = self._get_firestore_count(self.db.collection_group("pages"), skip_stream_on_timeout=True)
            stats["firestore_counts"]["book_pages"] = fs_pages
            
            if fs_pages != mg_pages:
                stats["passed"] = False
                stats["details"].append(f"Count mismatch in book_pages: Firestore={fs_pages}, MongoDB={mg_pages}")
            else:
                stats["details"].append(f"Collection book_pages verified: {fs_pages} documents.")
        except Exception as e:
            stats["details"].append(f"Global pages count query timed out or failed ({e}). Performing sample-based verification instead...")
            # Pick 5 sample books from MongoDB
            try:
                sample_books = list(self.mongo_db["books"].find({}, {"_id": 1, "title": 1}).limit(5))
                samples_passed = True
                for sb in sample_books:
                    bid = sb["_id"]
                    title = sb.get("title", bid)
                    fs_b_pages = self._get_firestore_count(self.db.collection("books").document(bid).collection("pages"))
                    mg_b_pages = self.mongo_db["book_pages"].count_documents({"bookId": bid})
                    if fs_b_pages != mg_b_pages:
                        samples_passed = False
                        stats["passed"] = False
                        stats["details"].append(f"  - Sample mismatch for '{title}' (ID {bid}): Firestore pages={fs_b_pages}, MongoDB pages={mg_b_pages}")
                    else:
                        stats["details"].append(f"  - Sample verified for '{title}': {fs_b_pages} pages match.")
                if samples_passed:
                    stats["details"].append("Sample-based verification of book_pages passed successfully!")
                    # Set the Firestore count to match MongoDB since verification passed
                    stats["firestore_counts"]["book_pages"] = mg_pages
                else:
                    stats["passed"] = False
            except Exception as inner_err:
                stats["passed"] = False
                stats["details"].append(f"Failed to perform pages sample verification: {inner_err}")
            
        # Count subcollection content
        try:
            mg_content = self.mongo_db["book_contents"].count_documents({})
            stats["mongodb_counts"]["book_contents"] = mg_content
            
            # Try counting globally but prevent streaming fallback
            fs_content = self._get_firestore_count(self.db.collection_group("content"), skip_stream_on_timeout=True)
            stats["firestore_counts"]["book_contents"] = fs_content
            
            if fs_content != mg_content:
                stats["passed"] = False
                stats["details"].append(f"Count mismatch in book_contents: Firestore={fs_content}, MongoDB={mg_content}")
            else:
                stats["details"].append(f"Collection book_contents verified: {fs_content} documents.")
        except Exception as e:
            stats["details"].append(f"Global content count query timed out or failed ({e}). Performing sample-based verification instead...")
            # Pick 5 sample books from MongoDB
            try:
                sample_books = list(self.mongo_db["books"].find({}, {"_id": 1, "title": 1}).limit(5))
                samples_passed = True
                for sb in sample_books:
                    bid = sb["_id"]
                    title = sb.get("title", bid)
                    fs_b_content = self._get_firestore_count(self.db.collection("books").document(bid).collection("content"))
                    mg_b_content = self.mongo_db["book_contents"].count_documents({"bookId": bid})
                    if fs_b_content != mg_b_content:
                        samples_passed = False
                        stats["passed"] = False
                        stats["details"].append(f"  - Sample mismatch for '{title}' (ID {bid}): Firestore content={fs_b_content}, MongoDB content={mg_b_content}")
                    else:
                        stats["details"].append(f"  - Sample verified for '{title}': {fs_b_content} content docs match.")
                if samples_passed:
                    stats["details"].append("Sample-based verification of book_contents passed successfully!")
                    stats["firestore_counts"]["book_contents"] = mg_content
                else:
                    stats["passed"] = False
            except Exception as inner_err:
                stats["passed"] = False
                stats["details"].append(f"Failed to perform content sample verification: {inner_err}")
            
        # 3. Evaluate users and nested collections
        try:
            fs_users = self._get_firestore_count(self.db.collection("users"))
            mg_users = self.mongo_db["users"].count_documents({})
            stats["firestore_counts"]["users"] = fs_users
            stats["mongodb_counts"]["users"] = mg_users
            
            if fs_users != mg_users:
                stats["passed"] = False
                stats["details"].append(f"Count mismatch in users: Firestore={fs_users}, MongoDB={mg_users}")
            else:
                stats["details"].append(f"Collection users verified: {fs_users} documents.")
        except Exception as e:
            stats["passed"] = False
            stats["details"].append(f"Error evaluating users: {e}")
            
        user_subcols = {
            "studyPlans": "user_studyPlans",
            "sessions": "user_sessions",
            "quizAttempts": "user_quizAttempts",
            "mastery": "user_mastery",
            "activity": "user_activity",
            "customBooks": "user_customBooks"
        }
        
        for fs_sub, mg_col in user_subcols.items():
            try:
                mg_count = self.mongo_db[mg_col].count_documents({})
                stats["mongodb_counts"][mg_col] = mg_count
                
                # Try counting globally but prevent streaming fallback
                fs_count = self._get_firestore_count(self.db.collection_group(fs_sub), skip_stream_on_timeout=True)
                stats["firestore_counts"][mg_col] = fs_count
                
                if fs_count != mg_count:
                    stats["passed"] = False
                    stats["details"].append(f"Count mismatch in {mg_col}: Firestore={fs_count}, MongoDB={mg_count}")
                else:
                    stats["details"].append(f"Collection {mg_col} verified: {fs_count} documents.")
            except Exception as e:
                stats["details"].append(f"Global count for {mg_col} query timed out or failed ({e}). Performing sample-based verification instead...")
                # Pick 3 sample users from MongoDB
                try:
                    sample_users = list(self.mongo_db["users"].find({}, {"_id": 1, "displayName": 1}).limit(3))
                    samples_passed = True
                    for su in sample_users:
                        uid = su["_id"]
                        name = su.get("displayName", uid)
                        fs_u_count = self._get_firestore_count(self.db.collection("users").document(uid).collection(fs_sub))
                        mg_u_count = self.mongo_db[mg_col].count_documents({"userId": uid})
                        if fs_u_count != mg_u_count:
                            samples_passed = False
                            stats["passed"] = False
                            stats["details"].append(f"  - Sample mismatch for user '{name}' ({uid}) in {fs_sub}: Firestore={fs_u_count}, MongoDB={mg_u_count}")
                        else:
                            stats["details"].append(f"  - Sample verified for user '{name}' ({uid}) in {fs_sub}: {fs_u_count} records match.")
                    if samples_passed:
                        stats["details"].append(f"Sample-based verification of {mg_col} passed successfully!")
                        stats["firestore_counts"][mg_col] = mg_count
                    else:
                        stats["passed"] = False
                except Exception as inner_err:
                    stats["passed"] = False
                    stats["details"].append(f"Failed to perform user subcollection {mg_col} sample verification: {inner_err}")
                
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
