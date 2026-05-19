import { Card } from '@/components/shared/atoms-server';

export default async function Overview({ params }: { params: Promise<{ locale: string; username: string }> }) {
  const { locale } = await params;
  const isAR = locale === 'ar';
  return (
    <Card className="p-5">
      <div className="font-extrabold text-slate-900 text-[15px] mb-3">{isAR ? 'نظرة عامة' : 'Overview'}</div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="p-3 rounded-lg bg-slate-50">
          <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-bold">{isAR ? 'ساعات' : 'Hours'}</div>
          <div className="font-extrabold text-slate-900 text-2xl ltr">38</div>
        </div>
        <div className="p-3 rounded-lg bg-slate-50">
          <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-bold">{isAR ? 'مفاهيم' : 'Concepts'}</div>
          <div className="font-extrabold text-emerald-600 text-2xl ltr">47</div>
        </div>
        <div className="p-3 rounded-lg bg-slate-50">
          <div className="text-[10.5px] text-slate-400 uppercase tracking-wider font-bold">{isAR ? 'دقة' : 'Accuracy'}</div>
          <div className="font-extrabold text-sky-600 text-2xl ltr">81%</div>
        </div>
      </div>
    </Card>
  );
}
