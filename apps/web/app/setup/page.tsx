import type { Metadata } from 'next';
import { NavbarWrapper } from '../components/navbar-wrapper';
import { Footer } from '../components/footer';
import { SetupClient } from './setup-client';

export const metadata: Metadata = {
  title: 'Download & Setup',
  description: 'Download KDeck for Windows or macOS and get set up in minutes.',
};

export default function SetupPage() {
  return (
    <>
      <NavbarWrapper />
      <div className="public-layout-body">
        <SetupClient />
        <Footer />
      </div>
    </>
  );
}
