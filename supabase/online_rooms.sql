-- ══════════════════════════════════════════
--  ONLINE_ROOMS — Salas multijugador
--  Pegar en: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.online_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  host_id    TEXT NOT NULL,
  guest_id   TEXT,
  status     TEXT NOT NULL DEFAULT 'waiting'
             CHECK (status IN ('waiting', 'playing', 'finished')),
  game_state JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_online_rooms_code
  ON public.online_rooms(code);

CREATE INDEX IF NOT EXISTS idx_online_rooms_status
  ON public.online_rooms(status);

ALTER TABLE public.online_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "online_rooms_select_authenticated"
  ON public.online_rooms
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "online_rooms_insert_authenticated"
  ON public.online_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "online_rooms_update_authenticated"
  ON public.online_rooms
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.online_rooms
  REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime
  ADD TABLE public.online_rooms;
