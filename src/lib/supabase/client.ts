import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { getSupabaseEnv } from './env';

/** Client per componenti `use client` (presenza, canali realtime): mai per letture protette da RLS lato server. */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
