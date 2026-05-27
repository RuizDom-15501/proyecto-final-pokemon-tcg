import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
  NgZone,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';

// ── Tipos internos ──────────────────────────────────────────────────────────
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
  color: string;
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

interface LoadStep {
  text: string;
  target: number;
  delay: number;
}

// ── Colores de partículas para variedad visual ──────────────────────────────
const PARTICLE_COLORS = [
  'rgba(201,162,39,0.9)',
  'rgba(88,28,220,0.8)',
  'rgba(0,200,255,0.8)',
  'rgba(46,213,115,0.7)',
  'rgba(255,71,87,0.7)',
];

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './splash.html',
  styleUrl: './splash.css'
  // Sin OnPush — el componente muta estado interno frecuentemente
})
export class SplashComponent implements OnInit, OnDestroy {

  @Output() done = new EventEmitter<void>();

  // ── Estado de progreso ──
  progress   = 0;
  statusText = 'Iniciando...';
  fadeOut    = false;
  logoVisible = false;

  // ── Partículas (generadas una sola vez) ──
  readonly particles: Particle[] = Array.from({ length: 40 }, (_, i) => ({
    id:       i,
    x:        Math.random() * 100,
    y:        Math.random() * 100,
    size:     Math.random() * 4 + 1,
    delay:    Math.random() * 7,
    duration: 6 + Math.random() * 8,
    opacity:  0.3 + Math.random() * 0.5,
    color:    PARTICLE_COLORS[i % PARTICLE_COLORS.length]
  }));

  // ── Estrellas (generadas una sola vez) ──
  readonly stars: Star[] = Array.from({ length: 70 }, (_, i) => ({
    id:       i,
    x:        Math.random() * 100,
    y:        Math.random() * 100,
    size:     Math.random() * 2 + 0.5,
    delay:    Math.random() * 5,
    duration: 2 + Math.random() * 4
  }));

  private readonly steps: LoadStep[] = [
    { text: 'Iniciando motor...',         target: 12,  delay: 0    },
    { text: 'Conectando entrenadores...', target: 28,  delay: 450  },
    { text: 'Cargando cartas...',         target: 52,  delay: 950  },
    { text: 'Sincronizando Pokédex...',   target: 70,  delay: 1550 },
    { text: 'Preparando batalla...',      target: 88,  delay: 2150 },
    { text: '¡Todo listo!',               target: 100, delay: 2750 },
  ];

  private timers: ReturnType<typeof setTimeout>[] = [];
  private rafId: number | null = null;

  constructor(
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Mostrar logo con pequeño delay para que el fade-in sea visible
    const logoTimer = setTimeout(() => {
      this.logoVisible = true;
      this.cdr.markForCheck();
    }, 100);
    this.timers.push(logoTimer);

    this.runSteps();
  }

  ngOnDestroy(): void {
    this.timers.forEach(t => clearTimeout(t));
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  // ── Secuencia de carga ──────────────────────────────────────────────────

  private runSteps(): void {
    this.steps.forEach(step => {
      const t = setTimeout(() => {
        this.statusText = step.text;
        this.animateProgressTo(step.target);
        this.cdr.markForCheck();
      }, step.delay);
      this.timers.push(t);
    });

    // Fade-out al terminar
    const fadeTimer = setTimeout(() => {
      this.fadeOut = true;
      this.cdr.markForCheck();

      const doneTimer = setTimeout(() => {
        // Emitir fuera de zone para no causar ExpressionChangedAfterItHasBeenChecked
        this.zone.run(() => this.done.emit());
      }, 750);
      this.timers.push(doneTimer);
    }, 3600);
    this.timers.push(fadeTimer);
  }

  // ── Animación de progreso con rAF (fuera de zone para no saturar CD) ──

  private animateProgressTo(target: number): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);

    // Corre fuera de NgZone para no disparar change detection en cada frame
    this.zone.runOutsideAngular(() => {
      const tick = () => {
        if (this.progress < target) {
          this.progress = Math.min(this.progress + 1, target);
          this.rafId = requestAnimationFrame(tick);
        } else {
          this.rafId = null;
          // Notificar a Angular solo cuando termina
          this.zone.run(() => this.cdr.markForCheck());
        }
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  // ── Música ambiental (Web Audio API, requiere gesto del usuario) ─────────

  playAmbient(): void {
    try {
      const ctx  = new AudioContext();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 3);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.5);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 3.5);
    } catch (_) { /* AudioContext no disponible en SSR o sin gesto */ }
  }
}
