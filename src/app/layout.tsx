import type { Metadata } from 'next';
import { Schibsted_Grotesk, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif' });
const ui = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted' });

export const metadata: Metadata = {
  title: 'Worldloom',
  description: 'Scrivi il tuo mondo, collegalo, guardalo da ogni lato.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${serif.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
