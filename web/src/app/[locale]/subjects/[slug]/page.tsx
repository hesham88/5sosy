'use client';

import { use } from 'react';
import SubjectScreen from '@/components/screens/subject/SubjectScreen';

export default function Page({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = use(params);
  return <SubjectScreen slug={slug} />;
}
