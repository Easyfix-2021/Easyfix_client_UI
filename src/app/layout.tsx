import './globals.css';
import { Mulish } from 'next/font/google';

const mulish = Mulish({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata = {
  title: 'EasyFix Client Portal',
  description: 'Client SPOC dashboard for the EasyFix workorder platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mulish.className}>
      <body>{children}</body>
    </html>
  );
}
