// ══════════════════════════════════════════
//  CLIENTE SUPABASE CENTRALIZADO
//  Importar desde aquí en todos los servicios
// ══════════════════════════════════════════
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL      = 'https://gfjkecpmgrwrnxrkklgu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nMm8qwB2vtyrP-B9QuQO6w_sYjsYhFN';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
