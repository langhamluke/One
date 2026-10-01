import type { Metadata, Viewport } from 'next';
import { Geist, Instrument_Serif } from 'next/font/google';
import Shell from './shell';
import '../index.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-sans' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'Sprout',
  description: 'Sprout helps high school and college students learn to save, invest, and build credit.',
};

export const viewport: Viewport = { themeColor: '#1e4d3b' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
