from __future__ import annotations

import os
from pymongo import MongoClient
from pymongo.database import Database

_client: MongoClient | None = None

def get_mongodb_client() -> tuple[MongoClient, Database]:
    """Retrieve or initialize the cached MongoDB client and database instance."""
    global _client
    uri = os.getenv("MONGODB_URI")
    if not uri or uri == "fetch_from_secret_manager":
        import subprocess
        try:
            project = os.getenv("FIRESTORE_PROJECT") or "khsosy"
            res = subprocess.run(
                ["gcloud", "secrets", "versions", "access", "latest", "--secret", "mongodb-uri", "--project", project],
                capture_output=True,
                text=True,
                check=True,
                shell=True
            )
            uri = res.stdout.strip()
        except Exception as e:
            raise ValueError(
                f"MONGODB_URI environment variable is not set or placeholder, and could not retrieve from Secret Manager: {e}"
            )
    
    if _client is None:
        # Specify serverSelectionTimeoutMS=5000 (5s) so connection failures (e.g. firewalls, 
        # un-whitelisted IP addresses) fail fast instead of hanging.
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        # Eagerly verify connection immediately to catch connection or firewall issues early.
        try:
            _client.admin.command("ping")
        except Exception as conn_err:
            _client = None  # Clear cache so next call can retry
            raise ConnectionError(
                f"Failed to connect to MongoDB. This is typically due to the client IP "
                f"not being whitelisted in the MongoDB Atlas Console (under Network Access -> IP Access List).\n"
                f"Connection Error: {conn_err}"
            ) from conn_err
        
    # Get database name from the connection string or default to 'khsosy'
    # For Atlas cluster URIs: mongodb+srv://.../dbname?options
    db_name = "khsosy"
    try:
        # Simple parsing to check if db name is specified in URI
        path = uri.split("?")[0].split("/")[-1]
        if path and not path.startswith("mongodb"):
            db_name = path
    except Exception:
        pass
        
    return _client, _client[db_name]
