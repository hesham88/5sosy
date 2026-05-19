import { notFound } from 'next/navigation';
import { getAdmin } from '@/lib/firebase/admin';
import { Card } from '@/components/shared/atoms-server';

export const dynamic = 'force-dynamic';

async function fetchUserByUsername(username: string) {
  try {
    const { db } = getAdmin();
    const snap = await db.collection('users').where('username', '==', username).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { uid: doc.id, ...(doc.data() as Record<string, unknown>) };
  } catch (e) {
    console.warn('fetchUserByUsername: admin SDK not available — falling back to demo data', (e as Error).message);
    return {
      uid: 'demo',
      username,
      displayName: username === 'youssef' ? 'Youssef Sherif' : username,
      grade: 'g3',
      track: 'sci_sci',
      streak: 7,
      xp: 1240,
      subjects: ['physics', 'chemistry', 'math']
    };
  }
}

export default async function UserProfile({ params }: { params: Promise<{ locale: string; username: string }> }) {
  const { locale, username } = await params;
  const user = await fetchUserByUsername(username);
  if (!user) notFound();
  const isAR = locale === 'ar';

  return (
    <Card className="p-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 grid place-items-center text-white font-extrabold text-2xl">
          {(user.displayName as string)?.slice(0, 1) || username[0]}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-900 truncate">{user.displayName as string}</h1>
          <div className="text-[12.5px] text-slate-500 ltr">@{username}</div>
          <div className="text-[12px] text-slate-500 mt-1">
            {isAR ? '٣ث علمي علوم' : 'G12 · Science'} · 🔥 {user.streak as number} · ✦ {(user.xp as number).toLocaleString()} XP
          </div>
        </div>
      </div>
    </Card>
  );
}
