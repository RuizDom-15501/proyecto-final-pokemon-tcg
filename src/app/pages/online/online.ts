import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { OnlineRoomService, OnlineRoom } from '../../services/online-room.service';

type Vista = 'menu' | 'creando' | 'esperando' | 'uniendo' | 'jugando';

@Component({
  selector: 'app-online',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './online.html',
  styleUrl: './online.css'
})
export class OnlineComponent implements OnDestroy {

  vista    = signal<Vista>('menu');
  room     = signal<OnlineRoom | null>(null);
  error    = signal<string | null>(null);
  loading  = signal(false);

  // Para unirse a sala
  codigoInput = '';

  constructor(
    public  authService: AuthService,
    private roomService: OnlineRoomService,
    private router: Router
  ) {}

  ngOnDestroy(): void {
    this.roomService.unsubscribe();
  }

  // ── Crear sala ────────────────────────────────────────────────────────────
  async crearSala(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']); return;
    }
    this.loading.set(true);
    this.error.set(null);

    const hostId = this.authService.getUserId() ?? this.authService.getUsername();
    const { room, error } = await this.roomService.createRoom(hostId);

    if (error || !room) {
      this.error.set('No se pudo crear la sala. Intenta de nuevo.');
      this.loading.set(false);
      return;
    }

    this.room.set(room);
    this.vista.set('esperando');
    this.loading.set(false);

    // Escuchar cuando el guest se une
    this.roomService.subscribeToRoom(room.id, (state) => {
      // Cuando el estado cambia a 'jugando', ir al juego
      const r = this.room();
      if (r && state.lastAction === '__guest_joined__') {
        this.irAlJuego(room.id, 'host');
      }
    });

    // Polling simple: verificar si alguien se unió
    this.pollForGuest(room.id);
  }

  // ── Unirse a sala ─────────────────────────────────────────────────────────
  async unirseASala(): Promise<void> {
    if (!this.codigoInput.trim()) {
      this.error.set('Ingresa un código de sala.'); return;
    }
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']); return;
    }
    this.loading.set(true);
    this.error.set(null);

    const guestId = this.authService.getUserId() ?? this.authService.getUsername();
    const { room, error } = await this.roomService.joinRoom(this.codigoInput.trim(), guestId);

    if (error || !room) {
      this.error.set('Sala no encontrada o ya está en uso.');
      this.loading.set(false);
      return;
    }

    this.room.set(room);
    this.loading.set(false);

    // Notificar al host que el guest se unió
    await this.roomService.pushState(room.id, {
      lastAction: '__guest_joined__',
      gameOver: false,
      ganador: '',
      turno: 'jugador',
      playerLife: 5000,
      cpuLife: 5000,
      roundNumber: 1
    });

    this.irAlJuego(room.id, 'guest');
  }

  // ── Ir al juego pasando roomId y rol por queryParams ──────────────────────
  private irAlJuego(roomId: string, rol: 'host' | 'guest'): void {
    this.roomService.unsubscribe();
    const code = this.room()?.code ?? '';
    this.router.navigate(['/game'], { queryParams: { roomId, rol, code } });
  }

  // ── Polling simple para detectar guest (fallback al Realtime) ────────────
  private pollForGuest(roomId: string): void {
    const interval = setInterval(async () => {
      const { data } = await this.roomService.getRoomById(roomId);
      if (data?.guest_id && data?.estado === 'jugando') {
        clearInterval(interval);
        this.irAlJuego(roomId, 'host');
      }
    }, 2000);
    // Limpiar después de 5 minutos si nadie se une
    setTimeout(() => clearInterval(interval), 300_000);
  }

  cancelar(): void {
    this.roomService.unsubscribe();
    this.room.set(null);
    this.error.set(null);
    this.codigoInput = '';
    this.vista.set('menu');
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
