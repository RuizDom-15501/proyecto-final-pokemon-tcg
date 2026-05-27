export interface StatusEffect {
  // ID único — SIEMPRE requerido para evitar NG0955 en @for track
  id: string;

  nombre: string;

  // 'buff' | 'debuff' para el template
  // 'paralyzed' | 'poisoned' son alias de debuff usados internamente
  tipo: 'buff' | 'debuff' | 'paralyzed' | 'poisoned';

  duracionTurnos: number;

  descripcion?: string;

  modificadorStats?: {
    ataque?: number;
    defensa?: number;
  };

  danioPorTurno?: number;

  bloqueaAtaque?: boolean;
}

export interface PokemonSkill {
  nombre: string;
  descripcion: string;
  efecto: (
    propietario: PokemonCard,
    objetivo?: PokemonCard
  ) => {
    log: string;
    statusEfecto?: StatusEffect;
  };
}

export interface PokemonCard {
  id: number;
  nombre: string;
  imagen: string;
  tipo: string;
  hp: number;
  ataque: number;
  defensa: number;
  vidaActual: number;
  rareza: string;
  descripcion: string;
  habilidad: PokemonSkill;
  efectosActivos: StatusEffect[];
}
