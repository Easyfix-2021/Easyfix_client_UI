import { MapPin } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function TxOnLocationPage() {
  return (
    <ComingSoon
      title="Tx on Location"
      description="Live tracking for technicians currently en-route or on-site at your customers' locations."
      icon={MapPin}
    />
  );
}
