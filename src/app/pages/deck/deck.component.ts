import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PokemonService } from '../../services/pokemon.service';
import { DeckService } from '../../services/deck.service';
import { AuthService } from '../../services/auth.service';
import { PokemonCard } from '../../models/pokemon-card';
import { SavedDeck, DeckEntry } from '../../models/game-records';

@Component({
  selector: 'app-deck',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deck.component.html',
  styleUrl: './deck.component.css'
})
export class DeckComponent implements OnInit {

  // ── Pokémon disponibles para agregar al mazo ──
  pokemonsDisponibles: PokemonCard[] = [];
  loadingPokemons = signal(false);

  // ── Mazo actual en edición ──
  deckActual: PokemonCard[] = [];
  deckNombre = 'Mi Mazo';

  // ── Mazos guardados en Supabase ──
  mazosGuardados = signal<SavedDeck[]>([]);
  loadingMazos   = signal(false);

  // ── UI / feedback ──
  guardando   = signal(false);
  mensaje     = signal<string | null>(null);
  tipoMensaje: 'ok' | 'error' = 'ok';

  constructor(
    private pokemonService: PokemonService,
    private deckService: DeckService,
    public  authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.cargarPokemons();
    if (this.authService.isAuthenticated()) {
      this.cargarMazos();
    }
  }

  // ══════════════════════════════════════════
  //  CARGAR POKÉMON DISPONIBLES (PokeAPI)
  // ══════════════════════════════════════════

  private cargarPokemons(): void {
    this.loadingPokemons.set(true);
    const ids = [906, 909, 912, 915, 921, 926, 929, 935, 938, 941, 944, 963];
    let loaded = 0;

    ids.forEach(id => {
      this.pokemonService.getPokemon(id).subscribe({
        next: (p) => {
          this.pokemonsDisponibles.push(p);
          loaded++;
          if (loaded === ids.length) this.loadingPokemons.set(false);
        },
        error: () => {
          loaded++;
          if (loaded === ids.length) this.loadingPokemons.set(false);
        }
      });
    });
  }

  // ══════════════════════════════════════════
  //  GESTIÓN DEL MAZO EN EDICIÓN
  // ══════════════════════════════════════════

  agregarAlMazo(pokemon: PokemonCard): void {
    if (this.deckActual.length >= 6) {
      this.mostrarMensaje('El mazo ya tiene 6 cartas (máximo).', 'error');
      return;
    }
    if (this.deckActual.find(p => p.id === pokemon.id)) {
      this.mostrarMensaje('Esta carta ya está en el mazo.', 'error');
      return;
    }
    this.deckActual.push({ ...pokemon });
  }

  quitarDelMazo(pokemon: PokemonCard): void {
    this.deckActual = this.deckActual.filter(p => p.id !== pokemon.id);
  }

  limpiarMazo(): void {
    this.deckActual = [];
  }

  // ══════════════════════════════════════════
  //  GUARDAR MAZO EN SUPABASE
  // ══════════════════════════════════════════

  async guardarMazo(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.mostrarMensaje('Inicia sesión para guardar mazos.', 'error');
      return;
    }
    if (this.deckActual.length === 0) {
      this.mostrarMensaje('Agrega al menos una carta al mazo.', 'error');
      return;
    }
    if (!this.deckNombre.trim()) {
      this.mostrarMensaje('Escribe un nombre para el mazo.', 'error');
      return;
    }

    this.guardando.set(true);

    const userId   = this.authService.getUserId()!;
    const username = this.authService.getUsername();
    const cards: DeckEntry[] = this.deckActual.map(p => ({
      id:      p.id,
      nombre:  p.nombre,
      tipo:    p.tipo,
      hp:      p.hp,
      ataque:  p.ataque,
      defensa: p.defensa
    }));

    const { error } = await this.deckService.saveDeck(
      userId, username, this.deckNombre.trim(), cards
    );

    if (error) {
      this.mostrarMensaje('Error al guardar el mazo. Intenta de nuevo.', 'error');
    } else {
      this.mostrarMensaje(`✅ Mazo "${this.deckNombre}" guardado.`, 'ok');
      await this.cargarMazos();
    }

    this.guardando.set(false);
  }

  // ══════════════════════════════════════════
  //  CARGAR MAZOS GUARDADOS
  // ══════════════════════════════════════════

  async cargarMazos(): Promise<void> {
    const userId = this.authService.getUserId();
    if (!userId) return;

    this.loadingMazos.set(true);
    const { data } = await this.deckService.getDecks(userId);
    this.mazosGuardados.set(data);
    this.loadingMazos.set(false);
  }

  // ══════════════════════════════════════════
  //  CARGAR MAZO AL EDITOR
  // ══════════════════════════════════════════

  cargarMazoEnEditor(mazo: SavedDeck): void {
    this.deckNombre = mazo.nombre;
    this.deckActual = mazo.cards.map(c => ({
      id:             c.id,
      nombre:         c.nombre,
      imagen:         `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${c.id}.png`,
      tipo:           c.tipo,
      hp:             c.hp,
      vidaActual:     c.hp,
      ataque:         c.ataque,
      defensa:        c.defensa,
      rareza:         'Común',
      descripcion:    '',
      efectosActivos: [],
      habilidad: {
        nombre:      'Impacto Directo',
        descripcion: '',
        efecto:      (_u: any, _o?: any) => ({ log: '' })
      }
    }));
    this.mostrarMensaje(`Mazo "${mazo.nombre}" cargado en el editor.`, 'ok');
  }

  // ══════════════════════════════════════════
  //  ELIMINAR MAZO
  // ══════════════════════════════════════════

  async eliminarMazo(mazo: SavedDeck): Promise<void> {
    if (!mazo.id) return;
    const userId = this.authService.getUserId()!;
    const { error } = await this.deckService.deleteDeck(mazo.id, userId);
    if (!error) {
      this.mostrarMensaje(`Mazo "${mazo.nombre}" eliminado.`, 'ok');
      await this.cargarMazos();
    } else {
      this.mostrarMensaje('Error al eliminar el mazo.', 'error');
    }
  }

  // ══════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════

  private mostrarMensaje(texto: string, tipo: 'ok' | 'error'): void {
    this.tipoMensaje = tipo;
    this.mensaje.set(texto);
    setTimeout(() => this.mensaje.set(null), 3500);
  }

  getTypeColor(tipo: string): string {
    const colors: Record<string, string> = {
      FIRE:     '#ff6b35', WATER:   '#4fc3f7', GRASS:    '#66bb6a',
      ELECTRIC: '#ffd54f', PSYCHIC: '#f48fb1', ICE:      '#80deea',
      DRAGON:   '#7e57c2', DARK:    '#546e7a', FAIRY:    '#f06292',
      NORMAL:   '#bdbdbd', BUG:     '#aed581', ROCK:     '#bcaaa4',
      GHOST:    '#7986cb', STEEL:   '#90a4ae', FIGHTING: '#ef5350',
      POISON:   '#ab47bc', GROUND:  '#d4a574', FLYING:   '#90caf9'
    };
    return colors[tipo?.toUpperCase()] ?? '#bdbdbd';
  }

  volverAlMenu(): void {
    this.router.navigate(['/']);
  }
}
