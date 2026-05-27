import { Injectable } from '@angular/core';
import { supabase } from '../core/supabase';
import { SavedDeck, DeckEntry } from '../models/game-records';

@Injectable({ providedIn: 'root' })
export class DeckService {

  // ══════════════════════════════════════════
  //  GUARDAR / ACTUALIZAR MAZO
  // ══════════════════════════════════════════

  async saveDeck(
    userId: string,
    username: string,
    deckName: string,
    cards: DeckEntry[]
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await supabase
      .from('decks')
      .upsert({
        user_id:        userId,
        player_username: username,
        nombre:         deckName,
        cards,
        updated_at:     new Date().toISOString()
      }, { onConflict: 'user_id,nombre' })
      .select()
      .single();

    if (error) console.error('[DeckService] saveDeck error:', error.message);
    else       console.log('[DeckService] Mazo guardado:', data?.id);

    return { data, error };
  }

  // ══════════════════════════════════════════
  //  OBTENER MAZOS DEL USUARIO
  // ══════════════════════════════════════════

  async getDecks(userId: string): Promise<{ data: SavedDeck[]; error: any }> {
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) console.error('[DeckService] getDecks error:', error.message);
    return { data: (data as SavedDeck[]) ?? [], error };
  }

  // ══════════════════════════════════════════
  //  OBTENER MAZO POR NOMBRE
  // ══════════════════════════════════════════

  async getDeckByName(userId: string, deckName: string): Promise<{ data: SavedDeck | null; error: any }> {
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('user_id', userId)
      .eq('nombre', deckName)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[DeckService] getDeckByName error:', error.message);
    }
    return { data: data as SavedDeck | null, error };
  }

  // ══════════════════════════════════════════
  //  ELIMINAR MAZO
  // ══════════════════════════════════════════

  async deleteDeck(deckId: string, userId: string): Promise<{ error: any }> {
    const { error } = await supabase
      .from('decks')
      .delete()
      .eq('id', deckId)
      .eq('user_id', userId); // RLS extra: solo el dueño puede borrar

    if (error) console.error('[DeckService] deleteDeck error:', error.message);
    return { error };
  }

  // ══════════════════════════════════════════
  //  GUARDAR CARTAS INDIVIDUALES (deck_cards)
  // ══════════════════════════════════════════

  async saveDeckCards(deckId: string, cards: DeckEntry[]): Promise<{ error: any }> {
    // Borrar cartas anteriores del mazo
    await supabase.from('deck_cards').delete().eq('deck_id', deckId);

    const rows = cards.map(c => ({
      deck_id:    deckId,
      pokemon_id: c.id
    }));

    const { error } = await supabase.from('deck_cards').insert(rows);
    if (error) console.error('[DeckService] saveDeckCards error:', error.message);
    return { error };
  }
}
