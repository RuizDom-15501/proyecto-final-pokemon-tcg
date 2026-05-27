// ══════════════════════════════════════════
//  Modelos para persistencia en Supabase
// ══════════════════════════════════════════

export interface Player {
  id?: string;
  username: string;
  email?: string;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  created_at?: string;
}

export interface GameRecord {
  id?: string;
  player_id?: string;
  player_username: string;
  resultado: 'victoria' | 'derrota' | 'empate';
  player_life_final: number;
  cpu_life_final: number;
  rounds_played: number;
  player_deck: DeckEntry[];
  cpu_deck: DeckEntry[];
  battle_log: string[];
  duration_seconds?: number;
  created_at?: string;
}

export interface DeckEntry {
  id: number;
  nombre: string;
  tipo: string;
  hp: number;
  ataque: number;
  defensa: number;
}

export interface BattleLogEntry {
  id?: string;
  game_id: string;
  round: number;
  action: string;
  attacker: string;
  defender: string;
  damage: number;
  timestamp?: string;
}

// ── Mazo guardado en Supabase ──
export interface SavedDeck {
  id?: string;
  user_id?: string;
  player_username?: string;
  nombre: string;       // nombre del mazo — usado en el template
  cards: DeckEntry[];
  updated_at?: string;
  created_at?: string;
}

// ── Estadísticas del jugador ──
export interface PlayerStats {
  user_id?: string;
  username: string;
  victorias: number;
  derrotas: number;
  empates: number;
  winrate: number;
  damage_total: number;
  partidas_jugadas: number;
  rating: number;
}

// ── Cola de matchmaking ──
export interface MatchmakingEntry {
  id?: string;
  user_id: string;
  username: string;
  estado: 'buscando' | 'encontrado' | 'cancelado';
  rating?: number;
  created_at?: string;
}
