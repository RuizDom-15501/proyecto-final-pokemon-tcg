export interface StatusEffect {
  nombre: string;
  tipo: string; // 'paralyzed' | 'poisoned' | 'buff'
  duracionTurnos: number;
  danioPorTurno?: number;
  bloqueaAtaque?: boolean;
  modificadorStats?: {
    ataque?: number;
    defensa?: number;
  };
}

export interface PokemonCard {
  id: number;
  nombre: string;
  imagen: string;
  tipo: string;
  hp: number;
  vidaActual: number;
  ataque: number;
  defensa: number;
  efectosActivos: StatusEffect[];
  habilidad: {
    nombre: string;
    descripcion: string;
    efecto: (usuario: PokemonCard, objetivo?: PokemonCard) => { log: string };
  };
}