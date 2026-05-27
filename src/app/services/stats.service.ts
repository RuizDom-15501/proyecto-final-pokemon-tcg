import { Injectable } from '@angular/core';
import { supabase } from '../core/supabase';
import { PlayerStats } from '../models/game-records';

@Injectable({ providedIn: 'root' })
export class StatsService {

  // ══════════════════════════════════════════
  //  OBTENER ESTADÍSTICAS DEL USUARIO
  // ══════════════════════════════════════════

  async getStats(userId: string): Promise<{ data: PlayerStats | null; error: any }> {
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
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[StatsService] getStats error:', error.message);
    }

    if (!data) return { data: null, error };

    const stats: PlayerStats = {
      user_id:          data.user_id,
      username:         (data as any).usuarios?.username ?? '',
      victorias:        data.victorias ?? 0,
      derrotas:         data.derrotas ?? 0,
      empates:          0,
      winrate:          data.winrate ?? 0,
      damage_total:     data.damage_total ?? 0,
      partidas_jugadas: (data.victorias ?? 0) + (data.derrotas ?? 0),
      rating:           0
    };

    return { data: stats, error: null };
  }

  // ══════════════════════════════════════════
  //  ACTUALIZAR ESTADÍSTICAS TRAS PARTIDA
  // ══════════════════════════════════════════

  async updateStats(
    userId: string,
    resultado: 'victoria' | 'derrota' | 'empate',
    damageDealt: number = 0
  ): Promise<{ error: any }> {
    // Obtener stats actuales
    const { data: current } = await supabase
      .from('estadisticas')
      .select('victorias, derrotas, winrate, damage_total')
      .eq('user_id', userId)
      .single();

    const victorias    = (current?.victorias    ?? 0) + (resultado === 'victoria' ? 1 : 0);
    const derrotas     = (current?.derrotas     ?? 0) + (resultado === 'derrota'  ? 1 : 0);
    const damage_total = (current?.damage_total ?? 0) + damageDealt;
    const total        = victorias + derrotas;
    const winrate      = total > 0 ? Math.round((victorias / total) * 100) : 0;

    const { error } = await supabase
      .from('estadisticas')
      .upsert({
        user_id:      userId,
        victorias,
        derrotas,
        winrate,
        damage_total
      }, { onConflict: 'user_id' });

    if (error) console.error('[StatsService] updateStats error:', error.message);
    return { error };
  }

  // ══════════════════════════════════════════
  //  RANKING GLOBAL
  // ══════════════════════════════════════════

  async getRanking(limit = 10): Promise<{ data: any[]; error: any }> {
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

    if (error) console.error('[StatsService] getRanking error:', error.message);
    return { data: data ?? [], error };
  }

  // ══════════════════════════════════════════
  //  HISTORIAL DE PARTIDAS DEL USUARIO
  // ══════════════════════════════════════════

  async getPartidas(userId: string, limit = 20): Promise<{ data: any[]; error: any }> {
    const { data, error } = await supabase
      .from('partidas')
      .select('id, resultado, player_life_final, cpu_life_final, rondas, fecha, duration_seconds')
      .eq('jugador_id', userId)
      .order('fecha', { ascending: false })
      .limit(limit);

    if (error) console.error('[StatsService] getPartidas error:', error.message);
    return { data: data ?? [], error };
  }
}
