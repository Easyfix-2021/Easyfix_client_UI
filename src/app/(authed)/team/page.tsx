import { Users } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function MyTeamPage() {
  return (
    <ComingSoon
      title="My Team"
      description="Reporting managers and SPOC team members linked to your client account."
      icon={Users}
    />
  );
}
