import { Card } from '@/components/shared/atoms-server';
import { ACTIVITY } from '@/constants/seed-data';

export default async function Activity({ params }: { params: Promise<{ locale: string; username: string }> }) {
  const { locale } = await params;
  const isAR = locale === 'ar';
  return (
    <Card className="p-5">
      <div className="font-extrabold text-slate-900 text-[15px] mb-3">{isAR ? 'النشاط الأخير' : 'Recent activity'}</div>
      <div className="space-y-2.5">
        {ACTIVITY.map((a, i) => (
          <div key={i} className="flex items-start gap-2.5 text-[12.5px]">
            <div className="w-7 h-7 rounded-full bg-slate-100 grid place-items-center text-[14px] shrink-0">{a.glyph}</div>
            <div className="flex-1 min-w-0">
              <div className="text-slate-700">{isAR ? a.arT : a.enT}</div>
              <div className="text-[10.5px] text-slate-400 mt-0.5 ltr">{a.agent} · {isAR ? a.ago : a.agoEn}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
