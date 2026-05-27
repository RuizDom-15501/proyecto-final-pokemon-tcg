import { Injectable } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../core/supabase';

// ── Estado mínimo sincronizado entre jugadores ──────────────────────────────
export interface GameState {
  turno:       'jugador' | 'cpu';
  playerLife:  number;
  cpuLife:     number;
  roundNumber: number;
  lastAction:  string;
  gameOver:    boolean;
  ganador:     string;
  timestamp:   number;   // Date.now() — ignora estados más viejos
  senderRole:  string;   // 'host' | 'guest' — ignora propios updates
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

@Injectable({ providedIn: 'root' })
export class OnlineRoomService {

  private channel: RealtimeChannel | null = null;

  // ── Generar código de sala de 6 caracteres ──────────────────────────────
  private generateCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // ── Crear sala (host) ───────────────────────────────────────────────────
  async createRoom(hostId: string): Promise<{ room: OnlineRoom | null; error: any }> {
    const code = this.generateCode();
    console.log('[ONLINE] createRoom → hostId:', hostId, '| code:', code);

    const { data, error } = await supabase
      .from('online_rooms')
      .insert({
        code,
        host_id:    hostId,
        status:     'waiting',
        game_state: null
      })
      .select()
      .single();

    if (error) {
      console.error('[ONLINE ERROR] createRoom failed:', error.message, error.details, error.hint);
    } else {
      console.log('[ONLINE] createRoom OK → room id:', data?.id);
    }

    return { room: data as OnlineRoom | null, error };
  }

  // ── Unirse a sala (guest) ───────────────────────────────────────────────
  async joinRoom(code: string, guestId: string): Promise<{ room: OnlineRoom | null; error: any }> {
    const upperCode = code.toUpperCase().trim();
    console.log('[ONLINE] joinRoom → code:', upperCode, '| guestId:', guestId);

    // 1. Buscar sala por código en estado 'waiting'
    const { data: room, error: findErr } = await supabase
      .from('online_rooms')
      .select('*')
      .eq('code', upperCode)
      .eq('status', 'waiting')
      .single();

    if (findErr || !room) {
      console.error('[ONLINE ERROR] joinRoom — sala no encontrada:', findErr?.message ?? 'null');
      return { room: null, error: findErr ?? 'Sala no encontrada o ya está en uso' };
    }

    console.log('[ONLINE] joinRoom — sala encontrada:', room.id);

    // 2. Registrar guest y cambiar estado a 'playing'
    const { data, error } = await supabase
      .from('online_rooms')
      .update({ guest_id: guestId, status: 'playing' })
      .eq('id', room.id)
      .select()
      .single();

    if (error) {
      console.error('[ONLINE ERROR] joinRoom — update failed:', error.message);
    } else {
      console.log('[ONLINE] joinRoom OK → room:', data?.id, '| status:', data?.status);
    }

    return { room: data as OnlineRoom | null, error };
  }

  // ── Publicar estado del juego ───────────────────────────────────────────
  async pushState(roomId: string, state: Partial<GameState>): Promise<void> {
    console.log('[ONLINE] pushState → roomId:', roomId, '| action:', state.lastAction);

    const { error } = await supabase
      .from('online_rooms')
      .update({ game_state: state })
      .eq('id', roomId);

    if (error) {
      console.error('[ONLINE ERROR] pushState failed:', error.message);
    }
  }

  // ── Suscribirse a cambios en tiempo real ────────────────────────────────
  subscribeToRoom(roomId: string, onUpdate: (state: GameState) => void): void {
    this.unsubscribe(); // limpiar canal anterior

    console.log('[ONLINE] subscribeToRoom → roomId:', roomId);

    this.channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'online_rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          console.log('[ONLINE] realtime UPDATE recibido');
          const gs = (payload.new as any)?.game_state as GameState | null;
          if (gs) {
            onUpdate(gs);
          }
        }
      )
      .subscribe((status) => {
        console.log('[ONLINE] channel status:', status);
      });
  }

  // ── Limpiar suscripción ─────────────────────────────────────────────────
  unsubscribe(): void {
    if (this.channel) {
      console.log('[ONLINE] unsubscribe — limpiando canal');
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // ── Marcar sala como terminada ──────────────────────────────────────────
  async closeRoom(roomId: string): Promise<void> {
    console.log('[ONLINE] closeRoom → roomId:', roomId);
    const { error } = await supabase
      .from('online_rooms')
      .update({ status: 'finished' })
      .eq('id', roomId);

    if (error) {
      console.error('[ONLINE ERROR] closeRoom failed:', error.message);
    }
  }

  // ── Obtener sala por ID ─────────────────────────────────────────────────
  async getRoomById(roomId: string): Promise<{ data: OnlineRoom | null; error: any }> {
    const { data, error } = await supabase
      .from('online_rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error) {
      console.error('[ONLINE ERROR] getRoomById failed:', error.message);
    }

    return { data: data as OnlineRoom | null, error };
  }
}
