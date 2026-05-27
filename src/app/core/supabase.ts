// ══════════════════════════════════════════
//  CLIENTE SUPABASE CENTRALIZADO
//  Importar desde aquí en todos los servicios
// ══════════════════════════════════════════
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL      = 'https://gfjkecpmgrwrnxrkklgu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmamtlY3BtZ3J3cm54cmtrbGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Njg5NzYsImV4cCI6MjA5NTE0NDk3Nn0.DtxG3PA0FY0gICTDv4k3VPIeuW77rIHnwXcQAQ2-hi8';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
