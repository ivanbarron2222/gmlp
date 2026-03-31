import 'server-only';

import { createClient } from '@supabase/supabase-js';
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  hasSupabaseAdminEnv,
} from '@/lib/supabase/env';

export function getSupabaseAdminClient() {
  if (!hasSupabaseAdminEnv()) {
    throw new Error('Missing Supabase admin environment variables.');
  }

  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
