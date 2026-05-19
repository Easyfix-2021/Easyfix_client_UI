import { ClipboardCheck } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function UnderAuditPage() {
  return (
    <ComingSoon
      title="Completed & Under Audit"
      description="Recently completed jobs awaiting your audit, rating, and invoice approval."
      icon={ClipboardCheck}
    />
  );
}
