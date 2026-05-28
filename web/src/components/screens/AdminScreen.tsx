'use client';

import { ChromeLayout } from '../shared/Chrome';
import { Card } from '../shared/atoms';
import { useProfile } from '@/lib/firebase/use-profile';
import { ROLE_LABELS, ROLE_PERMISSIONS, hasPermission, type UserRole } from '@/lib/roles';
import { SAMPLE_ADMIN_KPIS, SAMPLE_SCHOOL, SAMPLE_USERS } from '@/lib/sample-social';

export default function AdminScreen() {
  const { profile, loading } = useProfile();
  const role = (profile?.role ?? 'guest') as UserRole;
  const allowed = hasPermission(role, 'view_admin_dashboard');

  return (
    <ChromeLayout>
      <div className="px-5 py-6 lg:px-10 lg:py-8 max-w-[1500px]">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Admin</h1>
          <p className="mt-1 text-[14px] text-slate-500">
            Role control, relationship maps, KPI insights, profile administration, and timetable oversight.
          </p>
        </div>

        {loading ? (
          <Card className="p-5 text-[13px] text-slate-500">Loading...</Card>
        ) : !allowed ? (
          <Card className="p-5">
            <div className="text-[13px] font-bold uppercase tracking-wider text-slate-400">Restricted</div>
            <div className="mt-2 text-xl font-extrabold text-slate-900">Admin access required</div>
            <p className="mt-2 text-[14px] text-slate-600">
              Your current role is {ROLE_LABELS[role]}. Super admin is currently hardcoded to
              hesham1988@gmail.com.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {SAMPLE_ADMIN_KPIS.map((kpi) => (
                <Card key={kpi.label} className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-900">{kpi.value}</div>
                  <div className="mt-1 text-[12px] font-bold text-emerald-600">{kpi.delta}</div>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <Card className="p-5 xl:col-span-5">
                <SectionTitle title="Role matrix" />
                <div className="space-y-3">
                  {(Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((r) => (
                    <div key={r} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-extrabold text-slate-900">{ROLE_LABELS[r]}</div>
                        <div className="text-[11px] text-slate-500">{ROLE_PERMISSIONS[r].length} permissions</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ROLE_PERMISSIONS[r].map((permission) => (
                          <span key={permission} className="rounded-md bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600">
                            {permission}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5 xl:col-span-4">
                <SectionTitle title="Relationship map" />
                <div className="space-y-3">
                  <MapRow label="School" value={SAMPLE_SCHOOL.name} />
                  <MapRow label="School admin" value={SAMPLE_USERS.find((u) => u.role === 'school_admin')?.displayName ?? ''} />
                  <MapRow label="Teacher" value={SAMPLE_USERS.find((u) => u.role === 'teacher')?.displayName ?? ''} />
                  <MapRow label="Student" value={SAMPLE_USERS.find((u) => u.role === 'student')?.displayName ?? ''} />
                  <MapRow label="Parent" value={SAMPLE_USERS.find((u) => u.role === 'parent')?.displayName ?? ''} />
                </div>
              </Card>

              <Card className="p-5 xl:col-span-3">
                <SectionTitle title="Micromanagement" />
                <div className="space-y-2">
                  {['Role overrides', 'Profile review', 'Group admin assignment', 'School staff links', 'Timetable revisions'].map((item) => (
                    <button key={item} className="w-full rounded-lg bg-slate-50 px-3 py-2 text-start text-[12px] font-bold text-slate-700 hover:bg-slate-100">
                      {item}
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <SectionTitle title="Entity administration" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {SAMPLE_USERS.map((user) => (
                  <div key={user.uid} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="text-[13px] font-extrabold text-slate-900">{user.displayName}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{ROLE_LABELS[user.role]}</div>
                    <div className="mt-2 text-[12px] text-slate-600">{user.description}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </ChromeLayout>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <div className="mb-4 text-[13px] font-extrabold uppercase tracking-wider text-slate-500">{title}</div>;
}

function MapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-[13px] font-bold text-slate-800">{value}</div>
    </div>
  );
}

