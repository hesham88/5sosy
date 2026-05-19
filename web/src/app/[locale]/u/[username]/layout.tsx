import { ChromeLayout } from '@/components/shared/Chrome';

/**
 * Parallel routes: @overview and @activity render alongside the main page.
 * Demonstrates Next.js advanced routing for user/profile views.
 */
export default function UserLayout({
  children,
  overview,
  activity
}: {
  children: React.ReactNode;
  overview: React.ReactNode;
  activity: React.ReactNode;
}) {
  return (
    <ChromeLayout>
      <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1400px]">
        {children}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          <div className="lg:col-span-8 min-w-0">{overview}</div>
          <div className="lg:col-span-4 min-w-0">{activity}</div>
        </div>
      </div>
    </ChromeLayout>
  );
}
