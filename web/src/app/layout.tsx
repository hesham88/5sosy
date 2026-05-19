import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: '5sosy — خصوصي الذكي',
  description: 'Autonomous AI study assistant for Egyptian Thanaweya Amma students.',
  icons: { icon: '/favicon.ico' }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
