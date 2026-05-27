import { Injectable } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../core/supabase';

// ── Snapshot de una carta (serializable a JSON) ─────────────────────────────
export interface CardSnapshot {
  id:         number;
  nombre:     string;
  tipo:       string;
  hp:         number;
  vidaActual: number;
  ataque:     number;
  defensa:    number;
  imagen:     string;
}

// ── Intención de acción del guest → host ────────────────────────────────────
export type GuestIntent =
  | { type: 'attack';  cardId: number }
  | { type: 'ability'; cardId: number }
  | { type: 'switch';  cardId: number };

// ── Estado completo sincronizado (host authoritative) ───────────────────────
export interface GameState {
  // Turno y ronda
  turno:       'jugador' | 'cpu';
  roundNumber: number;

  // Vida global
  playerLife:  number;
  cpuLife:     number;

  // Estado completo de cartas (publicado por el host)
  playerActive: CardSnapshot | null;
  playerBench:  CardSnapshot[];
  cpuActive:    CardSnapshot | null;
  cpuBench:     CardSnapshot[];

  // Metadatos de sincronización
  lastAction:  string;
  gameOver:    boolean;
  ganador:     string;
  timestamp:   number;    // Date.now() — ignora estados más viejos
  senderRole:  string;    // 'host' | 'guest' — ignora propios updates

  // Intención del guest (solo se usa cuando senderRole === 'guest')
  guestIntent?: GuestIntent;

  // Mazo inicial (solo en el primer publish del host)
  initialDeck?: {
    playerActive: CardSnapshot;
    playerBench:  CardSnapshot[];
    cpuActive:    CardSnapshot;
    cpuBench:     CardSnapshot[];
  };
}

// ── Fila de la tabla online_rooms ───────────────────────────────────────────
export interface OnlineRoom {
  id:         string;
  code:       string;
  host_id:    string;
  guest_id:   string | null;
  status:     'waiting' | 'playing' | 'finished';
  game_state: Partial<GameState> | null;
  created_at: string;
}

// ── Persistencia de sesión ──────────────────────────────────────────────────
const LS_KEY = 'pokemon_online_session';

export interface OnlineSession {
  roomId:    string;
  roomCode:  string;
  onlineRol: 'host' | 'guest';
}

@Injectable({ providedIn: 'root' })
export class OnlineRoomService {

  private channel: RealtimeChannel | null = null;

  // ── Sesión localStorage ─────────────────────────────────────────────────
  saveSession(s: OnlineSession): void {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    console.log('[ONLINE] sesión guardada:', s.roomId);
  }

  loadSession(): OnlineSession | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as OnlineSession) : null;
    } catch { return null; }
  }

  clearSession(): void {
    localStorage.removeItem(LS_KEY);
    console.log('[ONLINE] sesión eliminada');
  }

  // ── Generar código de sala ──────────────────────────────────────────────
  private generateCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // ── Crear sala (host) ───────────────────────────────────────────────────
  async createRoom(hostId: string): Promise<{ room: OnlineRoom | null; error: any }> {
    const code = this.generateCode();
    console.log('[ONLINE] createRoom → hostId:', hostId, '| code:', code);

    const { data, error } = await supabase
      .from('online_rooms')
      .insert({ code, host_id: hostId, status: 'waiting', game_state: null })
      .select()
      .single();

    if (error) console.error('[ONLINE ERROR] createRoom:', error.message);
    else       console.log('[ONLINE] createRoom OK → id:', data?.id);

    return { room: data as OnlineRoom | null, error };
  }

  // ── Unirse a sala (guest) ───────────────────────────────────────────────
  async joinRoom(code: string, guestId: string): Promise<{ room: OnlineRoom | null; error: any }> {
    const upperCode = code.toUpperCase().trim();
    console.log('[ONLINE] joinRoom → code:', upperCode);

    const { data: room, error: findErr } = await supabase
      .from('online_rooms')
      .select('*')
      .eq('code', upperCode)
      .eq('status', 'waiting')
      .single();

    if (findErr || !room) {
      console.error('[ONLINE ERROR] joinRoom — sala no encontrada:', findErr?.message);
      return { room: null, error: findErr ?? 'Sala no encontrada' };
    }

    const { data, error } = await supabase
      .from('online_rooms')
      .update({ guest_id: guestId, status: 'playing' })
      .eq('id', room.id)
      .select()
      .single();

    if (error) console.error('[ONLINE ERROR] joinRoom update:', error.message);
    else       console.log('[ONLINE] joinRoom OK → id:', data?.id);

    return { room: data as OnlineRoom | null, error };
  }

  // ── Publicar estado ─────────────────────────────────────────────────────
  async pushState(roomId: string, state: Partial<GameState>): Promise<void> {
    console.log('[PUBLISH] pushState → action:', state.lastAction,
      '| turno:', state.turno, '| ts:', state.timestamp);

    const { error } = await supabase
      .from('online_rooms')
      .update({ game_state: state })
      .eq('id', roomId);

    if (error) console.error('[ONLINE ERROR] pushState:', error.message);
  }

  // ── Suscribirse a cambios realtime ──────────────────────────────────────
  subscribeToRoom(roomId: string, onUpdate: (state: GameState) => void): void {
    this.unsubscribe();
    console.log('[ONLINE] subscribeToRoom → roomId:', roomId);

    this.channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'online_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const gs = (payload.new as any)?.game_state as GameState | null;
          console.log('[REMOTE] UPDATE recibido | senderRole:', gs?.senderRole,
            '| action:', gs?.lastAction, '| ts:', gs?.timestamp);
          if (gs) onUpdate(gs);
        }
      )
      .subscribe((status) => console.log('[ONLINE] channel status:', status));
  }

  // ── Limpiar suscripción ─────────────────────────────────────────────────
  unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      console.log('[ONLINE] canal limpiado');
    }
  }

  // ── Cerrar sala ─────────────────────────────────────────────────────────
  async closeRoom(roomId: string): Promise<void> {
    const { error } = await supabase
      .from('online_rooms')
      .update({ status: 'finished' })
      .eq('id', roomId);
    if (error) console.error('[ONLINE ERROR] closeRoom:', error.message);
  }

  // ── Obtener sala por ID ─────────────────────────────────────────────────
  async getRoomById(roomId: string): Promise<{ data: OnlineRoom | null; error: any }> {
    const { data, error } = await supabase
      .from('online_rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    if (error) console.error('[ONLINE ERROR] getRoomById:', error.message);
    return { data: data as OnlineRoom | null, error };
  }
}
