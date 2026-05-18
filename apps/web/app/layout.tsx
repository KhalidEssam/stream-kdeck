import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Control Surface',
  description: 'Buy and activate Control Surface desktop licenses.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
