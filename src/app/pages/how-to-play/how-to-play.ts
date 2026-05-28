import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

interface Rule {
  icon: string;
  title: string;
  desc: string;
}

@Component({
  selector: 'app-how-to-play',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './how-to-play.html',
  styleUrl: './how-to-play.css'
})
export class HowToPlayComponent {

  constructor(private router: Router) {}

  goHome() { this.router.navigate(['/']); }

  rules: Rule[] = [
    {
      icon: '🎯',
      title: 'Objetivo',
      desc: 'Reduce la vida global del rival a 0. Cada jugador empieza con 5000 HP globales.'
    },
    {
      icon: '🃏',
      title: 'Tu equipo',
      desc: 'Tienes 5 Pokémon: 1 activo en campo y 4 en reserva. Solo el activo puede atacar y recibir daño directo.'
    },
    {
      icon: '⚔️',
      title: 'Ataque básico',
      desc: 'Inflige daño al Pokémon activo rival. El daño se calcula como: Ataque − Defensa del rival (mínimo 80).'
    },
    {
      icon: '✨',
      title: 'Habilidad especial',
      desc: 'Cada Pokémon tiene una habilidad única. Puede curar, potenciar stats, paralizar o infligir daño especial.'
    },
    {
      icon: '🔄',
      title: 'Cambio de Pokémon',
      desc: 'Puedes cambiar tu Pokémon activo por uno de la reserva. Esto también consume tu turno.'
    },
    {
      icon: '💀',
      title: 'KO',
      desc: 'Cuando un Pokémon llega a 0 HP, es eliminado. El siguiente de la reserva entra automáticamente.'
    },
    {
      icon: '🎯',
      title: 'Golpe directo',
      desc: 'Si el rival no tiene Pokémon activo, los ataques dañan directamente su vida global.'
    },
    {
      icon: '🏆',
      title: 'Victoria',
      desc: 'Gana quien deje la vida global del rival en 0. Si ambos llegan a 0 al mismo tiempo, es empate.'
    }
  ];

  onlineRules: Rule[] = [
    {
      icon: '🌐',
      title: 'Crear sala',
      desc: 'El host crea una sala y recibe un código de 6 letras. Compártelo con tu rival.'
    },
    {
      icon: '🚪',
      title: 'Unirse',
      desc: 'El guest ingresa el código para unirse. Ambos son llevados al tablero automáticamente.'
    },
    {
      icon: '🔁',
      title: 'Turnos alternados',
      desc: 'Host actúa primero (turno "jugador"), luego el guest (turno "rival"). Se alternan cada acción.'
    },
    {
      icon: '📡',
      title: 'Sincronización',
      desc: 'El estado del juego se sincroniza en tiempo real vía Supabase Realtime. El host es la fuente de verdad.'
    },
    {
      icon: '🔄',
      title: 'Reconexión',
      desc: 'Si refrescas la página, el juego intenta reconectarte automáticamente a tu sala activa.'
    }
  ];
}
