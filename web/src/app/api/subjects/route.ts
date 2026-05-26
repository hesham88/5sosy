import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    
    // Fetch all subjects from 'subject' collection
    const subjects = await db.collection('subject').find({}).toArray();
    
    // Aggregate books grouped by subject slug
    const subjectBookDetails = await db.collection('books').aggregate([
      {
        $group: {
          _id: '$subject',
          languages: { $addToSet: '$language' },
          grades: { $addToSet: '$grade' },
          types: { $addToSet: '$type' },
          books: {
            $push: {
              id: '$_id',
              title: '$title',
              titleI18n: '$titleI18n',
              language: '$language',
              grade: '$grade',
              type: '$type'
            }
          }
        }
      }
    ]).toArray();
    
    // Map aggregation results into a dictionary for fast lookup
    const subjectMap: Record<string, {
      languages: string[];
      grades: string[];
      types: string[];
      books: Array<{ id: string; title: string; titleI18n?: Record<string, string>; language?: string; grade?: string; type?: string }>;
    }> = {};

    for (const item of subjectBookDetails) {
      if (item._id) {
        const slug = item._id.toString();
        const languages = Array.from(new Set(item.languages)).filter(Boolean) as string[];
        const grades = Array.from(new Set(item.grades)).filter(Boolean) as string[];
        const types = Array.from(new Set(item.types)).filter(Boolean) as string[];
        
        const books = (item.books || []).map((b: any) => ({
          id: b.id.toString(),
          title: b.title || '',
          titleI18n: b.titleI18n,
          language: b.language,
          grade: b.grade,
          type: b.type
        }));

        subjectMap[slug] = {
          languages,
          grades,
          types,
          books
        };
      }
    }
    
    // Attach book count and dynamic details to each subject
    const list = subjects.map((sub: any) => {
      const details = subjectMap[sub.slug] || { languages: [], grades: [], types: [], books: [] };
      return {
        slug: sub.slug,
        name: sub.name,
        nameI18n: sub.nameI18n,
        descriptionI18n: sub.descriptionI18n,
        hue: sub.hue,
        glyph: sub.glyph,
        tracks: sub.tracks || [],
        bookCount: details.books.length,
        languages: details.languages,
        grades: details.grades,
        types: details.types,
        books: details.books
      };
    });
    
    // Sort subjects by slug alphabetically
    list.sort((a, b) => a.slug.localeCompare(b.slug));
    
    return NextResponse.json(list, {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30'
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/subjects] Error fetching subjects:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
