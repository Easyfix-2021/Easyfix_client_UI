import { Ticket } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function NewTicketsPage() {
  return (
    <ComingSoon
      title="New Tickets"
      description="Newly raised tickets pending acknowledgement by the EasyFix team will appear here."
      icon={Ticket}
    />
  );
}
