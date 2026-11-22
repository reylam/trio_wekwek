// Lazy Supabase Storage client (service role) untuk upload bukti Before & After.
// Dibuat lazy agar endpoint non-upload tetap berjalan bila env storage belum diset.
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import config from './config.js';

export const SUPABASE_BUCKET = config.supabaseBucket;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set di environment.');
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export default getSupabase;
