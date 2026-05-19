import { ReceiptText } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function RateCardPage() {
  return (
    <ComingSoon
      title="Get My Rate Card"
      description="Download or preview your contracted service rate card across categories and skill levels."
      icon={ReceiptText}
    />
  );
}
