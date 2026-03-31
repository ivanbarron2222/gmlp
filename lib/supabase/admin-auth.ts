import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export interface AdminStaffContext {
  supabase: ReturnType<typeof getSupabaseAdminClient>;
  userId: string;
  email: string;
  fullName: string;
}

export async function requireAdminStaffAccess(request: Request): Promise<AdminStaffContext> {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('Missing authorization token.');
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
  const supabase = getSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    throw new Error(userError?.message ?? 'Unable to verify authenticated user.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('id, email, full_name, role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? 'Staff profile not found.');
  }

  if (profile.role !== 'admin') {
    throw new Error('Admin access required.');
  }

  return {
    supabase,
    userId: String(profile.id),
    email: String(profile.email ?? userData.user.email ?? ''),
    fullName: String(profile.full_name ?? ''),
  };
}
