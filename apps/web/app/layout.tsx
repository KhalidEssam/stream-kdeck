import type { Metadata } from 'next';
import { Barlow_Condensed, Figtree } from 'next/font/google';
import './globals.css';

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'KDeck', template: '%s · KDeck' },
  description: 'KDeck — a programmable tile deck for your desktop. Custom tiles, AI assistant, and shortcuts for every workflow.',
  keywords: ['stream deck alternative', 'macro keyboard', 'custom shortcuts', 'productivity tool', 'KDeck'],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${barlowCondensed.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}
