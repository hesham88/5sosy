import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAdmin } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const provider = (process.env.DATABASE_PROVIDER || 'firestore').toLowerCase();

    if (provider === 'mongodb') {
      const { db } = await connectToDatabase();

      // 1. Get overall metrics (total books, total pages, avg pages)
      const overallPipeline = [
        {
          $group: {
            _id: null,
            totalBooks: { $sum: 1 },
            totalPages: { $sum: { $ifNull: ['$pages', 0] } },
            avgPages: { $avg: { $ifNull: ['$pages', 0] } },
          }
        }
      ];
      const overallResults = await db.collection('books').aggregate(overallPipeline).toArray();
      const overall = overallResults[0] || { totalBooks: 0, totalPages: 0, avgPages: 0 };

      // 2. Get language distribution
      const langPipeline = [
        {
          $group: {
            _id: { $ifNull: ['$language', 'unknown'] },
            count: { $sum: 1 }
          }
        }
      ];
      const langResults = await db.collection('books').aggregate(langPipeline).toArray();
      const languages = langResults.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      // 3. Get subject distribution
      const subjectPipeline = [
        {
          $group: {
            _id: { $ifNull: ['$subject', 'unknown'] },
            count: { $sum: 1 }
          }
        }
      ];
      const subjectResults = await db.collection('books').aggregate(subjectPipeline).toArray();
      const subjects = subjectResults.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      // 4. Get type distribution
      const typePipeline = [
        {
          $group: {
            _id: { $ifNull: ['$type', 'unknown'] },
            count: { $sum: 1 }
          }
        }
      ];
      const typeResults = await db.collection('books').aggregate(typePipeline).toArray();
      const types = typeResults.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      // 5. Get pages stats by subject
      const pagesPipeline = [
        {
          $group: {
            _id: { $ifNull: ['$subject', 'unknown'] },
            avgPages: { $avg: { $ifNull: ['$pages', 0] } },
            totalPages: { $sum: { $ifNull: ['$pages', 0] } }
          }
        }
      ];
      const pagesResults = await db.collection('books').aggregate(pagesPipeline).toArray();
      const pagesBySubject = pagesResults.reduce((acc: any, curr: any) => {
        acc[curr._id] = {
          avg: Math.round(curr.avgPages || 0),
          total: curr.totalPages || 0
        };
        return acc;
      }, {});

      return NextResponse.json({
        totalBooks: overall.totalBooks,
        totalPages: overall.totalPages,
        avgPages: Math.round(overall.avgPages * 10) / 10,
        languages,
        subjects,
        types,
        pagesBySubject
      });
    } else {
      // Firestore fallback
      const { db } = getAdmin();
      const booksSnap = await db.collection('books').get();

      let totalBooks = 0;
      let totalPages = 0;
      const languages: Record<string, number> = {};
      const subjects: Record<string, number> = {};
      const types: Record<string, number> = {};
      const pagesBySubject: Record<string, { avg: number; total: number; count: number }> = {};

      booksSnap.forEach((doc) => {
        const data = doc.data();
        totalBooks++;
        const pCount = Number(data.pages) || 0;
        totalPages += pCount;

        const lang = data.language || 'unknown';
        languages[lang] = (languages[lang] || 0) + 1;

        const sub = data.subject || 'unknown';
        subjects[sub] = (subjects[sub] || 0) + 1;

        const typ = data.type || 'unknown';
        types[typ] = (types[typ] || 0) + 1;

        if (!pagesBySubject[sub]) {
          pagesBySubject[sub] = { avg: 0, total: 0, count: 0 };
        }
        pagesBySubject[sub].count++;
        pagesBySubject[sub].total += pCount;
      });

      // Calculate averages for Firestore
      const finalPagesBySubject: Record<string, { avg: number; total: number }> = {};
      for (const [sub, item] of Object.entries(pagesBySubject)) {
        finalPagesBySubject[sub] = {
          total: item.total,
          avg: item.count > 0 ? Math.round(item.total / item.count) : 0
        };
      }

      const avgPages = totalBooks > 0 ? totalPages / totalBooks : 0;

      return NextResponse.json({
        totalBooks,
        totalPages,
        avgPages: Math.round(avgPages * 10) / 10,
        languages,
        subjects,
        types,
        pagesBySubject: finalPagesBySubject
      });
    }
  } catch (err: any) {
    console.error('[api/books/insights] Error generating insights:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
