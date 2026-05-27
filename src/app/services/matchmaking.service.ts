import { Injectable, signal } from '@angular/core';
import { supabase } from '../core/supabase';
import { MatchmakingEntry } from '../models/game-records';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class MatchmakingService {

  // ── Estado reactivo ──
  estado        = signal<'idle' | 'buscando' | 'encontrado' | 'cancelado'>('idle');
  oponente      = signal<string | null>(null);
  matchId       = signal<string | null>(null);

  private channel: RealtimeChannel | null = null;

  // ══════════════════════════════════════════
  //  ENTRAR A LA COLA
  // ══════════════════════════════════════════

  async joinQueue(userId: string, username: string, rating = 1000): Promise<{ error: any }> {
    this.estado.set('buscando');

    // Insertar en cola
    const { error } = await supabase
      .from('matchmaking_queue')
      .upsert({
        user_id:    userId,
        username,
        estado:     'buscando',
        rating,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('[Matchmaking] joinQueue error:', error.message);
      this.estado.set('idle');
      return { error };
    }

    // Suscribirse a cambios en tiempo real
    this.subscribeToQueue(userId);

    // Buscar oponente disponible
    await this.findOpponent(userId, username);

    return { error: null };
  }

  // ══════════════════════════════════════════
  //  BUSCAR OPONENTE
  // ══════════════════════════════════════════

  private async findOpponent(userId: string, username: string): Promise<void> {
    const { data } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .eq('estado', 'buscando')
      .neq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (data) {
      // Encontramos oponente — crear sala
      const roomId = `room_${Date.now()}`;
      this.matchId.set(roomId);
      this.oponente.set(data.username);
      this.estado.set('encontrado');

      // Marcar ambos como encontrados
      await supabase
        .from('matchmaking_queue')
        .update({ estado: 'encontrado' })
        .in('user_id', [userId, data.user_id]);

      console.log(`[Matchmaking] Match encontrado: ${username} vs ${data.username} — Sala: ${roomId}`);
    }
  }

  // ══════════════════════════════════════════
  //  REALTIME — ESCUCHAR CAMBIOS EN LA COLA
  // ══════════════════════════════════════════

  private subscribeToQueue(userId: string): void {
    this.channel = supabase
      .channel(`matchmaking:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'matchmaking_queue',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const row = payload.new as MatchmakingEntry;
          if (row.estado === 'encontrado') {
            this.estado.set('encontrado');
            console.log('[Matchmaking] Realtime: match encontrado');
          }
        }
      )
      .subscribe();
  }

  // ══════════════════════════════════════════
  //  SALIR DE LA COLA
  // ══════════════════════════════════════════

  async leaveQueue(userId: string): Promise<void> {
    this.estado.set('cancelado');
    this.oponente.set(null);

    await supabase
      .from('matchmaking_queue')
      .update({ estado: 'cancelado' })
      .eq('user_id', userId);

    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.estado.set('idle');
  }

  // ══════════════════════════════════════════
  //  CANAL DE BATALLA EN TIEMPO REAL
  //  (Arquitectura lista — lógica de juego pendiente)
  // ══════════════════════════════════════════

  subscribeToBattleRoom(
    roomId: string,
    onMessage: (payload: any) => void
  ): RealtimeChannel {
    const ch = supabase
      .channel(`battle:${roomId}`)
      .on('broadcast', { event: 'game_action' }, onMessage)
      .subscribe();

    console.log(`[Matchmaking] Suscrito a sala: ${roomId}`);
    return ch;
  }

  async sendBattleAction(roomId: string, action: object): Promise<void> {
    await supabase
      .channel(`battle:${roomId}`)
      .send({
        type:    'broadcast',
        event:   'game_action',
        payload: action
      });
  }
}
