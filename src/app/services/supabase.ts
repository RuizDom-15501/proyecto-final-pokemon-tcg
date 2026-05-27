// ══════════════════════════════════════════
//  SupabaseService — Servicio legacy mantenido
//  para compatibilidad con game.ts existente.
//  Los nuevos servicios usan auth.service.ts,
//  game.service.ts, deck.service.ts, stats.service.ts
// ══════════════════════════════════════════
import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../core/supabase';
import { Player, GameRecord, BattleLogEntry } from '../models/game-records';

@Injectable({ providedIn: 'root' })
export class SupabaseService {

  // Exponer cliente para uso directo si se necesita
  readonly client: SupabaseClient = supabase;

  // ══════════════════════════════════════════
  //  AUTH (delegado al cliente centralizado)
  // ══════════════════════════════════════════

  async signUp(email: string, password: string, username: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    if (error) console.error('[Supabase] signUp error:', error.message);
    return { data, error };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) console.error('[Supabase] signIn error:', error.message);
    return { data, error };
  }

  async signOut() {
    return supabase.auth.signOut();
  }

  async getSession() {
    return supabase.auth.getSession();
  }

  async getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
  }

  // ══════════════════════════════════════════
  //  JUGADORES
  // ══════════════════════════════════════════

  async upsertPlayer(player: Player) {
    const { data, error } = await supabase
      .from('players')
      .upsert(player, { onConflict: 'username' })
      .select()
      .single();
    if (error) console.error('[Supabase] upsertPlayer error:', error.message);
    return { data, error };
  }

  async getPlayer(username: string) {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('username', username)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('[Supabase] getPlayer error:', error.message);
    }
    return { data, error };
  }

  async getLeaderboard(limit = 10) {
    const { data, error } = await supabase
      .from('players')
      .select('username, wins, losses, draws, rating')
      .order('rating', { ascending: false })
      .limit(limit);
    if (error) console.error('[Supabase] getLeaderboard error:', error.message);
    return { data, error };
  }

  // ══════════════════════════════════════════
  //  PARTIDAS
  // ══════════════════════════════════════════

  async saveGame(record: GameRecord) {
    const { data, error } = await supabase
      .from('partidas')
      .insert({
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
    if (error) console.error('[Supabase] saveGame error:', error.message);
    else       console.log('[Supabase] Partida guardada:', data?.id);
    return { data, error };
  }

  async getGameHistory(username: string, limit = 20) {
    const { data, error } = await supabase
      .from('partidas')
      .select('id, resultado, player_life_final, cpu_life_final, rondas, fecha')
      .eq('player_username', username)
      .order('fecha', { ascending: false })
      .limit(limit);
    if (error) console.error('[Supabase] getGameHistory error:', error.message);
    return { data, error };
  }

  async getGameById(id: string) {
    const { data, error } = await supabase
      .from('partidas')
      .select('*')
      .eq('id', id)
      .single();
    if (error) console.error('[Supabase] getGameById error:', error.message);
    return { data, error };
  }

  // ══════════════════════════════════════════
  //  MAZOS
  // ══════════════════════════════════════════

  async saveDeck(username: string, deckName: string, cards: any[]) {
    const { data, error } = await supabase
      .from('decks')
      .upsert({
        player_username: username,
        nombre:          deckName,
        cards,
        updated_at:      new Date().toISOString()
      }, { onConflict: 'player_username,nombre' })
      .select()
      .single();
    if (error) console.error('[Supabase] saveDeck error:', error.message);
    return { data, error };
  }

  async getDecks(username: string) {
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('player_username', username)
      .order('updated_at', { ascending: false });
    if (error) console.error('[Supabase] getDecks error:', error.message);
    return { data, error };
  }

  // ══════════════════════════════════════════
  //  HISTORIAL DE BATALLA
  // ══════════════════════════════════════════

  async saveBattleLog(entries: BattleLogEntry[]) {
    const { data, error } = await supabase
      .from('battle_logs')
      .insert(entries);
    if (error) console.error('[Supabase] saveBattleLog error:', error.message);
    return { data, error };
  }

  async getBattleLog(gameId: string) {
    const { data, error } = await supabase
      .from('battle_logs')
      .select('*')
      .eq('game_id', gameId)
      .order('round', { ascending: true });
    if (error) console.error('[Supabase] getBattleLog error:', error.message);
    return { data, error };
  }

  // ══════════════════════════════════════════
  //  ESTADÍSTICAS
  // ══════════════════════════════════════════

  async updatePlayerStats(username: string, resultado: 'victoria' | 'derrota' | 'empate') {
    const { data: player } = await this.getPlayer(username);

    const current: Player = player ?? {
      username,
      wins: 0, losses: 0, draws: 0, rating: 1000
    };

    if (resultado === 'victoria') {
      current.wins   = (current.wins   ?? 0) + 1;
      current.rating = (current.rating ?? 1000) + 25;
    } else if (resultado === 'derrota') {
      current.losses = (current.losses ?? 0) + 1;
      current.rating = Math.max(0, (current.rating ?? 1000) - 15);
    } else {
      current.draws  = (current.draws  ?? 0) + 1;
      current.rating = (current.rating ?? 1000) + 5;
    }

    return this.upsertPlayer(current);
  }
}
