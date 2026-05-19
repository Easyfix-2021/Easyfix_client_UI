import { CalendarCheck } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function CommittedAppointmentsPage() {
  return (
    <ComingSoon
      title="Committed Appointments"
      description="Confirmed visit slots for your customers across all open tickets."
      icon={CalendarCheck}
    />
  );
}
