import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { OnlineRoomService, OnlineRoom } from '../../services/online-room.service';

type Vista = 'menu' | 'creando' | 'esperando' | 'uniendo' | 'jugando';

// Tiempo máximo esperando rival (ms)
const WAIT_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 2_000;

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

  // Timers internos — limpiados en ngOnDestroy
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pollTimeout:  ReturnType<typeof setTimeout>  | null = null;
  private navigated = false;

  constructor(
    public  authService: AuthService,
    private roomService: OnlineRoomService,
    private router: Router
  ) {}

  ngOnDestroy(): void {
    this.limpiarTimers();
    this.roomService.unsubscribe();
  }

  private limpiarTimers(): void {
    if (this.pollInterval !== null) { clearInterval(this.pollInterval); this.pollInterval = null; }
    if (this.pollTimeout  !== null) { clearTimeout(this.pollTimeout);   this.pollTimeout  = null; }
  }

  // ── Crear sala ────────────────────────────────────────────────────────────
  async crearSala(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']); return;
    }
    if (this.loading()) return;  // guard anti-doble-click
    this.loading.set(true);
    this.error.set(null);
    this.navigated = false;

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
    console.log('[ROOM] sala creada:', room.id, '| código:', room.code);

    // Escuchar cuando el guest se une via Realtime
    this.roomService.subscribeToRoom(room.id, (state) => {
      if (state.lastAction === '__guest_joined__' && !this.navigated) {
        console.log('[ROOM] guest detectado via Realtime — navegando');
        this.navigated = true;
        this.limpiarTimers();
        this.irAlJuego(room.id, 'host');
      }
    });

    // Polling como fallback
    this.pollForGuest(room.id);
  }

  // ── Unirse a sala ─────────────────────────────────────────────────────────
  async unirseASala(): Promise<void> {
    const codigo = this.codigoInput.trim();
    if (!codigo) {
      this.error.set('Ingresa un código de sala.'); return;
    }
    if (codigo.length < 4) {
      this.error.set('El código debe tener al menos 4 caracteres.'); return;
    }
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']); return;
    }
    if (this.loading()) return;  // guard anti-doble-click
    this.loading.set(true);
    this.error.set(null);

    const guestId = this.authService.getUserId() ?? this.authService.getUsername();
    const { room, error } = await this.roomService.joinRoom(codigo, guestId);

    if (error || !room) {
      this.error.set('Sala no encontrada o ya está en uso. Verifica el código.');
      this.loading.set(false);
      return;
    }

    this.room.set(room);
    this.loading.set(false);
    console.log('[ROOM] guest unido a sala:', room.id, '| código:', room.code);

    // Notificar al host que el guest se unió
    await this.roomService.pushState(room.id, {
      lastAction: '__guest_joined__',
      gameOver:   false,
      ganador:    '',
      turno:      'jugador',
      playerLife: 5000,
      cpuLife:    5000,
      roundNumber: 1,
      playerBench: [],
      cpuBench:    [],
      playerActive: null,
      cpuActive:   null,
      timestamp:   Date.now(),
      senderRole:  'guest'
    });

    this.irAlJuego(room.id, 'guest');
  }

  // ── Ir al juego pasando roomId y rol por queryParams ──────────────────────
  private irAlJuego(roomId: string, rol: 'host' | 'guest'): void {
    this.limpiarTimers();
    this.roomService.unsubscribe();
    const code = this.room()?.code ?? '';
    console.log('[ROOM] navegando a /game | roomId:', roomId, '| rol:', rol, '| code:', code);
    this.router.navigate(['/game'], { queryParams: { roomId, rol, code } });
  }

  // ── Polling fallback para detectar guest ─────────────────────────────────
  private pollForGuest(roomId: string): void {
    this.limpiarTimers();

    this.pollInterval = setInterval(async () => {
      if (this.navigated) { this.limpiarTimers(); return; }
      const { data } = await this.roomService.getRoomById(roomId);
      if (data?.guest_id && data?.status === 'playing' && !this.navigated) {
        console.log('[ROOM] guest detectado via polling — navegando');
        this.navigated = true;
        this.limpiarTimers();
        this.irAlJuego(roomId, 'host');
      }
    }, POLL_INTERVAL_MS);

    // Timeout: sala expira si nadie se une
    this.pollTimeout = setTimeout(() => {
      if (!this.navigated) {
        this.limpiarTimers();
        this.roomService.unsubscribe();
        this.error.set('Tiempo de espera agotado. Nadie se unió a la sala.');
        this.vista.set('menu');
        this.room.set(null);
        console.warn('[ROOM] timeout esperando guest — sala cancelada');
      }
    }, WAIT_TIMEOUT_MS);
  }

  cancelar(): void {
    this.limpiarTimers();
    this.roomService.unsubscribe();
    // Cerrar sala si existe
    const r = this.room();
    if (r?.id) {
      this.roomService.closeRoom(r.id).catch(() => {});
    }
    this.room.set(null);
    this.error.set(null);
    this.codigoInput = '';
    this.navigated = false;
    this.vista.set('menu');
    console.log('[ROOM] sala cancelada por el host');
  }

  goHome(): void {
    this.limpiarTimers();
    this.router.navigate(['/']);
  }
}
