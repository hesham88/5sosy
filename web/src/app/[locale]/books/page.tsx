import { Suspense } from 'react';
import BooksScreen from '@/components/screens/BooksScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BooksScreen />
    </Suspense>
  );
}
