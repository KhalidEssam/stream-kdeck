import type { Metadata } from 'next';
import { Navbar } from '../components/navbar';
import { Footer } from '../components/footer';
import { SetupClient } from './setup-client';

export const metadata: Metadata = {
  title: 'Download & Setup',
  description: 'Download KDeck for Windows or macOS and get set up in minutes.',
};

export default function SetupPage() {
  return (
    <>
      <Navbar />
      <div className="public-layout-body">
        <SetupClient />
        <Footer />
      </div>
    </>
  );
}
