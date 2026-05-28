import ParentConsentApproval from '@/components/screens/ParentConsentApproval';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ParentConsentApproval token={token} />;
}

