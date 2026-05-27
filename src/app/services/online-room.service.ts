import { Injectable } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../core/supabase';

// Estado mínimo que se sincroniza entre jugadores
export interface GameState {
  turno:        'jugador' | 'cpu';
  playerLife:   number;
  cpuLife:      number;
  roundNumber:  number;
  lastAction:   string;
  gameOver:     boolean;
  ganador:      string;
  timestamp:    number;   // Date.now() — para ignorar estados viejos
  senderRole:   string;   // 'host' | 'guest' — para ignorar propios updates
}

export interface OnlineRoom {
  id:         string;
  code:       string;
  host_id:    string;
  guest_id:   string | null;
  estado:     'esperando' | 'jugando' | 'terminada';
  game_state: GameState;
}

@Injectable({ providedIn: 'root' })
export class OnlineRoomService {

  private channel: RealtimeChannel | null = null;

  // ── Generar código de sala de 6 letras ──────────────────────────────────
  private generateCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // ── Crear sala (host) ────────────────────────────────────────────────────
  async createRoom(hostId: string): Promise<{ room: OnlineRoom | null; error: any }> {
    const code = this.generateCode();
    const { data, error } = await supabase
      .from('online_rooms')
      .insert({ code, host_id: hostId, game_state: {} })
      .select()
      .single();

    return { room: data as OnlineRoom | null, error };
  }

  // ── Unirse a sala (guest) ────────────────────────────────────────────────
  async joinRoom(code: string, guestId: string): Promise<{ room: OnlineRoom | null; error: any }> {
    // Buscar sala por código
    const { data: room, error: findErr } = await supabase
      .from('online_rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('estado', 'esperando')
      .single();

    if (findErr || !room) return { room: null, error: findErr ?? 'Sala no encontrada' };

    // Registrar guest y cambiar estado a jugando
    const { data, error } = await supabase
      .from('online_rooms')
      .update({ guest_id: guestId, estado: 'jugando', updated_at: new Date().toISOString() })
      .eq('id', room.id)
      .select()
      .single();

    return { room: data as OnlineRoom | null, error };
  }

  // ── Publicar estado del juego ────────────────────────────────────────────
  async pushState(roomId: string, state: Partial<GameState>): Promise<void> {
    await supabase
      .from('online_rooms')
      .update({ game_state: state, updated_at: new Date().toISOString() })
      .eq('id', roomId);
  }

  // ── Suscribirse a cambios en tiempo real ─────────────────────────────────
  subscribeToRoom(roomId: string, onUpdate: (state: GameState) => void): void {
    this.unsubscribe(); // limpiar canal anterior si existe

    this.channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'online_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const gs = (payload.new as any)?.game_state as GameState;
          if (gs) onUpdate(gs);
        }
      )
      .subscribe();
  }

  // ── Limpiar suscripción ──────────────────────────────────────────────────
  unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // ── Marcar sala como terminada ───────────────────────────────────────────
  async closeRoom(roomId: string): Promise<void> {
    await supabase
      .from('online_rooms')
      .update({ estado: 'terminada', updated_at: new Date().toISOString() })
      .eq('id', roomId);
  }

  // ── Obtener sala por ID (para polling) ───────────────────────────────────
  async getRoomById(roomId: string): Promise<{ data: OnlineRoom | null; error: any }> {
    const { data, error } = await supabase
      .from('online_rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    return { data: data as OnlineRoom | null, error };
  }
}
