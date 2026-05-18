import { getSupabaseAdmin } from './supabase-admin';

export async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const supabase = getSupabaseAdmin();
  const normalized = email.toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (found) return { id: found.id };
    if (data.users.length < 1000) break;
  }

  return null;
}
