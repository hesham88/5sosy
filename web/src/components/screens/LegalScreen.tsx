'use client';

import Link from 'next/link';
import { useApp } from '../shared/Providers';
import { Logo } from '../shared/atoms';

// Public placeholder legal pages (Terms / Privacy). Real legal copy to be
// supplied later; this gives the footer links a real, branded destination.
export default function LegalScreen({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t, locale, isAR } = useApp();
  const title = kind === 'terms' ? t.landing.footerTerms : t.landing.footerPrivacy;

  const intro = kind === 'terms'
    ? (isAR
        ? 'باستخدامك تطبيق 5sosy فإنك توافق على الشروط التالية. هذه نسخة مبدئية وسيتم تحديثها بالنص القانوني الكامل قريبًا.'
        : 'By using 5sosy you agree to the following terms. This is a preliminary version and will be updated with the full legal text soon.')
    : (isAR
        ? 'نحن نحترم خصوصيتك. توضح هذه الصفحة كيف نتعامل مع بياناتك. هذه نسخة مبدئية وسيتم تحديثها بالنص القانوني الكامل قريبًا.'
        : 'We respect your privacy. This page explains how we handle your data. This is a preliminary version and will be updated with the full legal text soon.');

  const sections = kind === 'terms'
    ? (isAR
        ? [
            ['استخدام الخدمة', '5sosy أداة تعليمية لمساعدة طلاب الثانوية العامة. المحتوى للأغراض التعليمية فقط.'],
            ['الحسابات', 'يمكنك الدخول بحساب جوجل أو كضيف. أنت مسؤول عن نشاط حسابك.'],
            ['المحتوى', 'إجابات الذكاء الاصطناعي مبنية على كتب الوزارة لكنها قد تحتوي أخطاء؛ راجع دائمًا المصدر.'],
          ]
        : [
            ['Use of the service', '5sosy is an educational tool to help Thanaweya Amma students. Content is for learning purposes only.'],
            ['Accounts', 'You may sign in with Google or as a guest. You are responsible for activity on your account.'],
            ['Content', 'AI answers are grounded in ministry textbooks but may contain errors; always verify against the source.'],
          ])
    : (isAR
        ? [
            ['البيانات التي نجمعها', 'اسمك المختار وتفضيلاتك الدراسية وسجل تفاعلك لتحسين تجربتك.'],
            ['كيف نستخدمها', 'لتخصيص خطتك والإجابات. لا نبيع بياناتك الشخصية لأي طرف.'],
            ['حقوقك', 'يمكنك طلب تنزيل بياناتك أو حذف حسابك في أي وقت من الإعدادات.'],
          ]
        : [
            ['Data we collect', 'Your chosen name, study preferences, and interaction history to improve your experience.'],
            ['How we use it', 'To personalize your plan and answers. We never sell your personal data.'],
            ['Your rights', 'You can request a download of your data or delete your account anytime from Settings.'],
          ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/40 text-slate-900">
      <header className="px-5 py-4 border-b border-slate-200 bg-white/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="font-extrabold text-[17px] bg-gradient-to-r from-blue-600 to-orange-500 bg-clip-text text-transparent">5sosy</span>
          </Link>
          <Link href={`/${locale}`} className="text-[13px] font-semibold text-slate-500 hover:text-blue-600 transition">
            {isAR ? '← الرئيسية' : '← Home'}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-12">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-slate-600">{intro}</p>
        <div className="mt-8 space-y-6">
          {sections.map(([h, body], i) => (
            <section key={i} className="rounded-2xl bg-white/80 backdrop-blur border border-white/70 shadow-sm p-6">
              <h2 className="font-extrabold text-[16px] text-slate-900">{h}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 text-[12.5px] text-slate-400 text-center">
          © {new Date().getFullYear()} 5sosy · {t.landing.footerDevelopedBy}
        </p>
      </main>
    </div>
  );
}
