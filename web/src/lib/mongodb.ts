import { MongoClient, Db } from 'mongodb';

import { execSync } from 'child_process';

function getMongoUri(): string {
  let uri = process.env.MONGODB_URI;
  if (!uri || uri === 'fetch_from_secret_manager') {
    try {
      const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'khsosy';
      uri = execSync(`gcloud secrets versions access latest --secret mongodb-uri --project ${project}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch (err) {
      throw new Error(
        'MONGODB_URI environment variable is not set and could not be retrieved from gcloud Secret Manager.'
      );
    }
  }
  return uri;
}

const uri = getMongoUri();

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Create a new client if one doesn't exist
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(); // Uses the database name from the connection URI

  cachedClient = client;
  cachedDb = db;
  return { client, db };
}
