import { Clock4 } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function ClientDelayPage() {
  return (
    <ComingSoon
      title="Client Delay"
      description="Tickets blocked on your approval — estimates, reschedules, and quotation sign-offs."
      icon={Clock4}
    />
  );
}
