import { getCurrentSession } from '@/lib/auth/session';
import { Navbar } from './navbar';

export async function NavbarWrapper() {
  const session = await getCurrentSession();
  return <Navbar isLoggedIn={!!session} />;
}
