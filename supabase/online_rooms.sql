-- ══════════════════════════════════════════
--  ONLINE ROOMS — Modo multijugador básico
--  Pegar en: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.online_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,          -- código de 6 letras que comparte el host
  host_id      TEXT NOT NULL,                 -- user_id o username del creador
  guest_id     TEXT,                          -- user_id o username del que se une
  estado       TEXT NOT NULL DEFAULT 'esperando'
               CHECK (estado IN ('esperando','jugando','terminada')),
  -- Estado del juego sincronizado como JSON
  game_state   JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar por código rápido
CREATE INDEX IF NOT EXISTS idx_online_rooms_code ON public.online_rooms(code);

-- RLS: cualquiera puede leer/escribir (simplificado para el proyecto)
ALTER TABLE public.online_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_all" ON public.online_rooms
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime: habilitar la tabla
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_rooms;
