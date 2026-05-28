import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface PokedexEntry {
  id:       number;
  nombre:   string;
  tipo:     string;
  hp:       number;
  ataque:   number;
  defensa:  number;
  habilidad: string;
}

@Component({
  selector: 'app-pokedex',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pokedex.html',
  styleUrl: './pokedex.css'
})
export class PokedexComponent {

  constructor(private router: Router) {}

  goHome() { this.router.navigate(['/']); }

  busqueda = signal('');
  filtroTipo = signal('TODOS');

  readonly tipos = [
    'TODOS','GRASS','FIRE','WATER','ELECTRIC','NORMAL',
    'BUG','FAIRY','ROCK','PSYCHIC','FLYING','GHOST','DARK','DRAGON','ICE'
  ];

  readonly pokemon: PokedexEntry[] = [
    { id: 906,  nombre: 'SPRIGATITO',   tipo: 'GRASS',    hp: 600, ataque: 270, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 909,  nombre: 'FUECOCO',      tipo: 'FIRE',     hp: 650, ataque: 300, defensa: 180, habilidad: 'Impacto Directo' },
    { id: 912,  nombre: 'QUAXLY',       tipo: 'WATER',    hp: 700, ataque: 250, defensa: 220, habilidad: 'Impacto Directo' },
    { id: 915,  nombre: 'LECHONK',      tipo: 'NORMAL',   hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 918,  nombre: 'SPIDOPS',      tipo: 'BUG',      hp: 550, ataque: 240, defensa: 210, habilidad: 'Impacto Directo' },
    { id: 921,  nombre: 'PAWMI',        tipo: 'ELECTRIC', hp: 580, ataque: 320, defensa: 160, habilidad: 'Impacto Directo' },
    { id: 924,  nombre: 'TANDEMAUS',    tipo: 'NORMAL',   hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 926,  nombre: 'FIDOUGH',      tipo: 'FAIRY',    hp: 620, ataque: 260, defensa: 230, habilidad: 'Impacto Directo' },
    { id: 929,  nombre: 'SMOLIV',       tipo: 'GRASS',    hp: 600, ataque: 270, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 932,  nombre: 'SQUAWKABILLY', tipo: 'NORMAL',   hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 935,  nombre: 'CHARCADET',    tipo: 'FIRE',     hp: 650, ataque: 300, defensa: 180, habilidad: 'Impacto Directo' },
    { id: 938,  nombre: 'TADBULB',      tipo: 'ELECTRIC', hp: 580, ataque: 320, defensa: 160, habilidad: 'Impacto Directo' },
    { id: 941,  nombre: 'WATTREL',      tipo: 'ELECTRIC', hp: 580, ataque: 320, defensa: 160, habilidad: 'Impacto Directo' },
    { id: 944,  nombre: 'MASCHIFF',     tipo: 'DARK',     hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 946,  nombre: 'BRAMBLIN',     tipo: 'GRASS',    hp: 600, ataque: 270, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 949,  nombre: 'TOEDSCOOL',    tipo: 'GRASS',    hp: 600, ataque: 270, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 952,  nombre: 'KLAWF',        tipo: 'ROCK',     hp: 680, ataque: 260, defensa: 250, habilidad: 'Impacto Directo' },
    { id: 955,  nombre: 'CAPSAKID',     tipo: 'GRASS',    hp: 600, ataque: 270, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 958,  nombre: 'RELLOR',       tipo: 'BUG',      hp: 550, ataque: 240, defensa: 210, habilidad: 'Impacto Directo' },
    { id: 961,  nombre: 'FLITTLE',      tipo: 'PSYCHIC',  hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 963,  nombre: 'TINKATINK',    tipo: 'FAIRY',    hp: 620, ataque: 260, defensa: 230, habilidad: 'Impacto Directo' },
    { id: 966,  nombre: 'WIGLETT',      tipo: 'WATER',    hp: 700, ataque: 250, defensa: 220, habilidad: 'Impacto Directo' },
    { id: 969,  nombre: 'BOMBIRDIER',   tipo: 'FLYING',   hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 970,  nombre: 'GLIMMET',      tipo: 'ROCK',     hp: 680, ataque: 260, defensa: 250, habilidad: 'Impacto Directo' },
    { id: 973,  nombre: 'GREAVARD',     tipo: 'GHOST',    hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 976,  nombre: 'FLAMIGO',      tipo: 'FLYING',   hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 979,  nombre: 'CETODDLE',     tipo: 'ICE',      hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
    { id: 982,  nombre: 'VELUZA',       tipo: 'WATER',    hp: 700, ataque: 250, defensa: 220, habilidad: 'Impacto Directo' },
    { id: 985,  nombre: 'DONDOZO',      tipo: 'WATER',    hp: 700, ataque: 250, defensa: 220, habilidad: 'Impacto Directo' },
    { id: 988,  nombre: 'TATSUGIRI',    tipo: 'DRAGON',   hp: 600, ataque: 250, defensa: 200, habilidad: 'Impacto Directo' },
  ];

  readonly filtrados = computed(() => {
    const q    = this.busqueda().toLowerCase().trim();
    const tipo = this.filtroTipo();
    return this.pokemon.filter(p => {
      const matchNombre = !q || p.nombre.toLowerCase().includes(q);
      const matchTipo   = tipo === 'TODOS' || p.tipo === tipo;
      return matchNombre && matchTipo;
    });
  });

  getTypeColor(tipo: string): string {
    const colors: Record<string, string> = {
      FIRE:     '#ff6b35', WATER:    '#4fc3f7', GRASS:    '#66bb6a',
      ELECTRIC: '#ffd54f', PSYCHIC:  '#f48fb1', ICE:      '#80deea',
      DRAGON:   '#7e57c2', DARK:     '#546e7a', FAIRY:    '#f06292',
      FIGHTING: '#ef5350', POISON:   '#ab47bc', GROUND:   '#d4a574',
      FLYING:   '#90caf9', BUG:      '#aed581', ROCK:     '#bcaaa4',
      GHOST:    '#7986cb', STEEL:    '#90a4ae', NORMAL:   '#bdbdbd'
    };
    return colors[tipo] ?? '#bdbdbd';
  }

  getSprite(id: number): string {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  }

  onBusqueda(val: string) { this.busqueda.set(val); }
  onFiltroTipo(val: string) { this.filtroTipo.set(val); }
}
