import type { Metadata } from 'next';
import '@/styles/globals.css';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: '5sosy — خصوصي الذكي',
  description: 'Autonomous AI study assistant for Egyptian Thanaweya Amma students.',
  applicationName: '5sosy',
  keywords: [
    'Thanaweya Amma', 'ثانوية عامة', 'مذاكرة', 'مراجعة', 'منهج وزارة التربية والتعليم',
    'دروس خصوصية', 'مدرس ذكاء اصطناعي', 'AI tutor', 'Egypt education', 'study assistant',
    '5sosy', 'خصوصي',
  ],
  icons: { icon: '/favicon.ico' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: '5sosy',
    title: '5sosy — خصوصي الذكي',
    description: 'Autonomous AI study assistant for Egyptian Thanaweya Amma students.',
  },
  twitter: {
    card: 'summary_large_image',
    title: '5sosy — خصوصي الذكي',
    description: 'Autonomous AI study assistant for Egyptian Thanaweya Amma students.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
