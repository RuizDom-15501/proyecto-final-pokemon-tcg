-- ══════════════════════════════════════════
--  POKÉMON TCG — SCHEMA COMPLETO SUPABASE
--  Pegar en: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════

-- ── 1. USUARIOS ──────────────────────────
CREATE TABLE IF NOT EXISTS public.usuarios (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  username    TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_select_own"
  ON public.usuarios FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "usuarios_insert_own"
  ON public.usuarios FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "usuarios_update_own"
  ON public.usuarios FOR UPDATE
  USING (auth.uid() = id);

-- ── 2. DECKS ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.decks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  player_username TEXT,
  nombre          TEXT NOT NULL,
  cards           JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, nombre)
);

ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decks_select_own"
  ON public.decks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "decks_insert_own"
  ON public.decks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "decks_update_own"
  ON public.decks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "decks_delete_own"
  ON public.decks FOR DELETE
  USING (auth.uid() = user_id);

-- ── 3. DECK_CARDS (cartas individuales) ──
CREATE TABLE IF NOT EXISTS public.deck_cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id    UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  pokemon_id INTEGER NOT NULL
);

ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deck_cards_select_own"
  ON public.deck_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "deck_cards_insert_own"
  ON public.deck_cards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "deck_cards_delete_own"
  ON public.deck_cards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_id AND d.user_id = auth.uid()
    )
  );

-- ── 4. PARTIDAS ───────────────────────────
CREATE TABLE IF NOT EXISTS public.partidas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id        UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  player_username   TEXT,
  resultado         TEXT NOT NULL CHECK (resultado IN ('victoria','derrota','empate')),
  player_life_final INTEGER NOT NULL DEFAULT 0,
  cpu_life_final    INTEGER NOT NULL DEFAULT 0,
  rondas            INTEGER NOT NULL DEFAULT 0,
  player_deck       JSONB DEFAULT '[]',
  cpu_deck          JSONB DEFAULT '[]',
  battle_log        JSONB DEFAULT '[]',
  duration_seconds  INTEGER DEFAULT 0,
  fecha             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.partidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partidas_insert_all"
  ON public.partidas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "partidas_select_own"
  ON public.partidas FOR SELECT
  USING (
    jugador_id IS NULL
    OR auth.uid() = jugador_id
  );

-- ── 5. ESTADÍSTICAS ───────────────────────
CREATE TABLE IF NOT EXISTS public.estadisticas (
  user_id      UUID PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  victorias    INTEGER NOT NULL DEFAULT 0,
  derrotas     INTEGER NOT NULL DEFAULT 0,
  winrate      INTEGER NOT NULL DEFAULT 0,
  damage_total BIGINT  NOT NULL DEFAULT 0
);

ALTER TABLE public.estadisticas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estadisticas_select_own"
  ON public.estadisticas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "estadisticas_insert_own"
  ON public.estadisticas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "estadisticas_update_own"
  ON public.estadisticas FOR UPDATE
  USING (auth.uid() = user_id);

-- Vista pública para el ranking
CREATE OR REPLACE VIEW public.ranking_publico AS
  SELECT
    e.user_id,
    u.username,
    e.victorias,
    e.derrotas,
    e.winrate,
    e.damage_total
  FROM public.estadisticas e
  JOIN public.usuarios u ON u.id = e.user_id
  ORDER BY e.victorias DESC;

-- ── 6. MATCHMAKING_QUEUE ──────────────────
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  username   TEXT NOT NULL,
  estado     TEXT NOT NULL DEFAULT 'buscando'
             CHECK (estado IN ('buscando','encontrado','cancelado')),
  rating     INTEGER DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_select_buscando"
  ON public.matchmaking_queue FOR SELECT
  USING (estado = 'buscando' OR auth.uid() = user_id);

CREATE POLICY "queue_insert_own"
  ON public.matchmaking_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "queue_update_own"
  ON public.matchmaking_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "queue_delete_own"
  ON public.matchmaking_queue FOR DELETE
  USING (auth.uid() = user_id);

-- ── 7. BATTLE_LOGS ────────────────────────
CREATE TABLE IF NOT EXISTS public.battle_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID REFERENCES public.partidas(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL DEFAULT 0,
  action     TEXT,
  attacker   TEXT,
  defender   TEXT,
  damage     INTEGER DEFAULT 0,
  timestamp  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.battle_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_logs_insert_all"
  ON public.battle_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "battle_logs_select_own"
  ON public.battle_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partidas p
      WHERE p.id = game_id
        AND (p.jugador_id IS NULL OR p.jugador_id = auth.uid())
    )
  );

-- ── 8. PLAYERS (legacy) ───────────────────
CREATE TABLE IF NOT EXISTS public.players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username   TEXT NOT NULL UNIQUE,
  email      TEXT,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  draws      INTEGER NOT NULL DEFAULT 0,
  rating     INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players_select_all"
  ON public.players FOR SELECT
  USING (true);

CREATE POLICY "players_insert_all"
  ON public.players FOR INSERT
  WITH CHECK (true);

CREATE POLICY "players_update_all"
  ON public.players FOR UPDATE
  USING (true);

-- ── 9. GAME_RECORDS (legacy) ──────────────
CREATE TABLE IF NOT EXISTS public.game_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_username   TEXT,
  resultado         TEXT,
  player_life_final INTEGER DEFAULT 0,
  cpu_life_final    INTEGER DEFAULT 0,
  rounds_played     INTEGER DEFAULT 0,
  player_deck       JSONB DEFAULT '[]',
  cpu_deck          JSONB DEFAULT '[]',
  battle_log        JSONB DEFAULT '[]',
  duration_seconds  INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.game_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_records_insert_all"
  ON public.game_records FOR INSERT
  WITH CHECK (true);

CREATE POLICY "game_records_select_all"
  ON public.game_records FOR SELECT
  USING (true);

-- ══════════════════════════════════════════
--  10. ONLINE_ROOMS — SALAS MULTIJUGADOR
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

-- Índice para búsqueda rápida por código
CREATE INDEX IF NOT EXISTS idx_online_rooms_code
  ON public.online_rooms (code);

-- Índice para búsqueda por status
CREATE INDEX IF NOT EXISTS idx_online_rooms_status
  ON public.online_rooms (status);

-- ── RLS para online_rooms ─────────────────
ALTER TABLE public.online_rooms ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer salas
CREATE POLICY "online_rooms_select_authenticated"
  ON public.online_rooms FOR SELECT
  TO authenticated
  USING (true);

-- Cualquier usuario autenticado puede crear salas
CREATE POLICY "online_rooms_insert_authenticated"
  ON public.online_rooms FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Cualquier usuario autenticado puede actualizar salas
-- (host actualiza game_state, guest actualiza guest_id)
CREATE POLICY "online_rooms_update_authenticated"
  ON public.online_rooms FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── Replica Identity FULL para Realtime ───
-- Necesario para que postgres_changes envíe el payload completo
ALTER TABLE public.online_rooms REPLICA IDENTITY FULL;

-- ── Habilitar Realtime para online_rooms ──
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_rooms;

-- ── Habilitar Realtime para otras tablas ──
ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partidas;

-- ── Limpieza automática de salas viejas (opcional) ────────────────────────
-- Elimina salas terminadas o abandonadas con más de 2 horas
-- Puedes crear un cron job en Supabase con esta query:
-- DELETE FROM public.online_rooms
--   WHERE created_at < NOW() - INTERVAL '2 hours'
--     AND status IN ('finished', 'waiting');

-- ══════════════════════════════════════════
--  FIN DEL SCHEMA
-- ══════════════════════════════════════════
