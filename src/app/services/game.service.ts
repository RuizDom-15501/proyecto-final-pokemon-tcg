import { Injectable } from '@angular/core';
import { supabase } from '../core/supabase';
import { GameRecord, DeckEntry } from '../models/game-records';

@Injectable({ providedIn: 'root' })
export class GameService {

  // ══════════════════════════════════════════
  //  GUARDAR PARTIDA
  // ══════════════════════════════════════════

  async saveGame(record: GameRecord): Promise<{ data: any; error: any }> {
    const { data, error } = await supabase
      .from('partidas')
      .insert({
        jugador_id:        record.player_id ?? null,
        player_username:   record.player_username,
        resultado:         record.resultado,
        player_life_final: record.player_life_final,
        cpu_life_final:    record.cpu_life_final,
        rondas:            record.rounds_played,
        player_deck:       record.player_deck,
        cpu_deck:          record.cpu_deck,
        battle_log:        record.battle_log,
        duration_seconds:  record.duration_seconds ?? 0,
        fecha:             new Date().toISOString()
      })
      .select()
      .single();

    if (error) console.error('[GameService] saveGame error:', error.message);
    else       console.log('[GameService] Partida guardada ID:', data?.id);

    return { data, error };
  }

  // ══════════════════════════════════════════
  //  HISTORIAL DE PARTIDAS
  // ══════════════════════════════════════════

  async getGameHistory(username: string, limit = 20): Promise<{ data: any[]; error: any }> {
    const { data, error } = await supabase
      .from('partidas')
      .select('id, resultado, player_life_final, cpu_life_final, rondas, fecha, duration_seconds')
      .eq('player_username', username)
      .order('fecha', { ascending: false })
      .limit(limit);

    if (error) console.error('[GameService] getGameHistory error:', error.message);
    return { data: data ?? [], error };
  }

  async getGameById(id: string): Promise<{ data: any; error: any }> {
    const { data, error } = await supabase
      .from('partidas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) console.error('[GameService] getGameById error:', error.message);
    return { data, error };
  }

  // ══════════════════════════════════════════
  //  LEADERBOARD GLOBAL
  // ══════════════════════════════════════════

  async getLeaderboard(limit = 10): Promise<{ data: any[]; error: any }> {
    const { data, error } = await supabase
      .from('estadisticas')
      .select(`
        user_id,
        victorias,
        derrotas,
        winrate,
        damage_total,
        usuarios ( username )
      `)
      .order('victorias', { ascending: false })
      .limit(limit);

    if (error) console.error('[GameService] getLeaderboard error:', error.message);
    return { data: data ?? [], error };
  }
}
