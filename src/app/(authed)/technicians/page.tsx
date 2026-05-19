import { HardHat } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function MyTechniciansPage() {
  return (
    <ComingSoon
      title="My Technicians"
      description="EasyFix-certified technicians assigned to your account, with their skill matrix and live availability."
      icon={HardHat}
    />
  );
}
