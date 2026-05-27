import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { PokemonService } from '../../services/pokemon.service';
import { PokemonCard } from '../../models/pokemon-card';
import { SupabaseService } from '../../services/supabase';
import { GameService } from '../../services/game.service';
import { StatsService } from '../../services/stats.service';
import { AuthService } from '../../services/auth.service';
import { SoundService } from '../../services/sound.service';
import { AnimationService } from '../../services/animation.service';
import { OnlineRoomService, GameState } from '../../services/online-room.service';
import { GameRecord, DeckEntry } from '../../models/game-records';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game.html',
  styleUrl: './game.css'
})
export class GameComponent implements OnInit, OnDestroy {

  // ── Campo: 1 activa + 4 reserva ──
  playerActive: PokemonCard | null = null;
  playerBench: PokemonCard[] = [];
  cpuActive: PokemonCard | null = null;
  cpuBench: PokemonCard[] = [];

  // ── Vida global ──
  playerLife = 5000;
  playerMaxLife = 5000;
  cpuLife = 5000;
  cpuMaxLife = 5000;

  // ── Turno ──
  // 'jugador' = el jugador puede actuar
  // 'cpu'     = la CPU está actuando (bloqueado para el jugador)
  turno: 'jugador' | 'cpu' = 'jugador';
  roundNumber = 1;

  // ── Estado ──
  gameOver = false;
  resultado: 'victoria' | 'derrota' | 'empate' | null = null;
  mensaje = '';

  // ── UI ──
  cartaSeleccionada: PokemonCard | null = null;
  mostrarMenuAcciones = false;
  historialLog: string[] = [];
  cpuThinking = false;
  shakePlayer = false;
  shakeCpu = false;
  lastDamage = 0;
  showDamage = false;
  damageTarget: 'player' | 'cpu' = 'cpu';
  koMessage = '';
  showKo = false;
  directHitMessage = '';
  showDirectHit = false;

  // Animación de ataque por tipo
  attackAnim = false;
  attackAnimType = '';
  attackAnimTarget: 'player' | 'cpu' = 'cpu';

  // ── Efectos visuales premium ──
  screenFlash = false;
  screenFlashColor = 'rgba(255,255,255,0.15)';
  turnChangeAnim = false;
  floatingParticles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 8,
    duration: 6 + Math.random() * 6
  }));

  // ── Control de sonido ──
  get soundMuted(): boolean { return this.soundService.isMuted(); }

  private cpuTimer: any;
  private koTimer: any;
  private directHitTimer: any;
  private attackAnimTimer: any;
  private flashTimer: any;
  private turnAnimTimer: any;

  // ── Supabase ──
  private gameStartTime = Date.now();
  private totalDamageDealt = 0;

  // ── Online multiplayer (opcional) ──
  // Si no hay roomId, el juego funciona normal contra CPU
  private roomId:              string | null = null;
  onlineRol:                   'host' | 'guest' | null = null;
  private isApplyingRemoteState = false;   // guard anti-loop
  private lastRemoteTimestamp   = 0;       // ignora estados más viejos
  roomCode = '';
  get isOnline(): boolean { return !!this.roomId; }

  /**
   * En modo online el tablero es SIMÉTRICO:
   *   host  → controla el lado 'jugador' (cartas de abajo)
   *   guest → controla el lado 'cpu'     (cartas de arriba)
   *
   * Ambos ven el mismo tablero pero desde perspectivas opuestas.
   * El turno alterna: 'jugador' (host actúa) → 'cpu' (guest actúa) → ...
   */
  protected esMiTurnoOnline(): boolean {
    if (!this.isOnline) return true;
    if (this.onlineRol === 'host')  return this.turno === 'jugador';
    if (this.onlineRol === 'guest') return this.turno === 'cpu';
    return true;
  }

  constructor(
    private pokemonService: PokemonService,
    private router: Router,
    private route: ActivatedRoute,
    private supabaseService: SupabaseService,
    private gameService: GameService,
    private statsService: StatsService,
    public  authService: AuthService,
    public  soundService: SoundService,
    private animService: AnimationService,
    private onlineRoom: OnlineRoomService
  ) {}

  ngOnInit(): void {
    // Leer queryParams: ?roomId=XXX&rol=host|guest
    const params = this.route.snapshot.queryParamMap;
    this.roomId    = params.get('roomId');
    this.onlineRol = (params.get('rol') as 'host' | 'guest') ?? null;
    this.roomCode  = params.get('code') ?? '';

    this.iniciarPartida();

    // Si hay sala online, suscribirse a cambios del oponente
    if (this.roomId) {
      this.agregarLog(`🌐 Sala online: ${this.roomCode || this.roomId.slice(0,6).toUpperCase()}`);
      this.onlineRoom.subscribeToRoom(this.roomId, (state: GameState) => {
        this.aplicarEstadoRemoto(state);
      });
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.cpuTimer);
    clearTimeout(this.koTimer);
    clearTimeout(this.directHitTimer);
    clearTimeout(this.attackAnimTimer);
    clearTimeout(this.flashTimer);
    clearTimeout(this.turnAnimTimer);
    this.limpiarOnline();
  }

  /** Limpia recursos online al salir o reiniciar */
  private limpiarOnline(): void {
    if (this.roomId) {
      this.onlineRoom.unsubscribe();
      this.roomId = null;
      this.roomCode = '';
      this.onlineRol = null;
      this.isApplyingRemoteState = false;
      this.lastRemoteTimestamp = 0;
    }
  }

  // ══════════════════════════════════════════
  //  INICIO — 5 cartas ALEATORIAS por bando
  // ══════════════════════════════════════════

  iniciarPartida() {
    clearTimeout(this.cpuTimer);

    this.playerActive = null;
    this.playerBench = [];
    this.cpuActive = null;
    this.cpuBench = [];
    this.playerLife = 5000;
    this.playerMaxLife = 5000;
    this.cpuLife = 5000;
    this.cpuMaxLife = 5000;
    this.turno = 'jugador';
    this.roundNumber = 1;
    this.gameOver = false;
    this.resultado = null;
    this.mensaje = '';
    this.historialLog = [];
    this.cartaSeleccionada = null;
    this.mostrarMenuAcciones = false;
    this.cpuThinking = false;
    this.showKo = false;
    this.showDirectHit = false;

    // Pool de 30 Pokémon Gen 9 conocidos y válidos
    const pool: Array<{ id: number; nombre: string; tipo: string }> = [
      { id: 906,  nombre: 'SPRIGATITO', tipo: 'GRASS'    },
      { id: 909,  nombre: 'FUECOCO',    tipo: 'FIRE'     },
      { id: 912,  nombre: 'QUAXLY',     tipo: 'WATER'    },
      { id: 915,  nombre: 'LECHONK',    tipo: 'NORMAL'   },
      { id: 918,  nombre: 'SPIDOPS',    tipo: 'BUG'      },
      { id: 921,  nombre: 'PAWMI',      tipo: 'ELECTRIC' },
      { id: 924,  nombre: 'TANDEMAUS',  tipo: 'NORMAL'   },
      { id: 926,  nombre: 'FIDOUGH',    tipo: 'FAIRY'    },
      { id: 929,  nombre: 'SMOLIV',     tipo: 'GRASS'    },
      { id: 932,  nombre: 'SQUAWKABILLY', tipo: 'NORMAL' },
      { id: 935,  nombre: 'CHARCADET',  tipo: 'FIRE'     },
      { id: 938,  nombre: 'TADBULB',    tipo: 'ELECTRIC' },
      { id: 941,  nombre: 'WATTREL',    tipo: 'ELECTRIC' },
      { id: 944,  nombre: 'MASCHIFF',   tipo: 'DARK'     },
      { id: 946,  nombre: 'BRAMBLIN',   tipo: 'GRASS'    },
      { id: 949,  nombre: 'TOEDSCOOL',  tipo: 'GRASS'    },
      { id: 952,  nombre: 'KLAWF',      tipo: 'ROCK'     },
      { id: 955,  nombre: 'CAPSAKID',   tipo: 'GRASS'    },
      { id: 958,  nombre: 'RELLOR',     tipo: 'BUG'      },
      { id: 961,  nombre: 'FLITTLE',    tipo: 'PSYCHIC'  },
      { id: 963,  nombre: 'TINKATINK',  tipo: 'FAIRY'    },
      { id: 966,  nombre: 'WIGLETT',    tipo: 'WATER'    },
      { id: 969,  nombre: 'BOMBIRDIER', tipo: 'FLYING'   },
      { id: 970,  nombre: 'GLIMMET',    tipo: 'ROCK'     },
      { id: 973,  nombre: 'GREAVARD',   tipo: 'GHOST'    },
      { id: 976,  nombre: 'FLAMIGO',    tipo: 'FLYING'   },
      { id: 979,  nombre: 'CETODDLE',   tipo: 'ICE'      },
      { id: 982,  nombre: 'VELUZA',     tipo: 'WATER'    },
      { id: 985,  nombre: 'DONDOZO',    tipo: 'WATER'    },
      { id: 988,  nombre: 'TATSUGIRI',  tipo: 'DRAGON'   },
    ];

    // Mezclar y tomar 10 únicos (5 jugador + 5 CPU)
    const mezclado = [...pool].sort(() => Math.random() - 0.5);
    const selJugador = mezclado.slice(0, 5);
    const selCpu     = mezclado.slice(5, 10);

    this.playerActive = this.cartaEmergencia(selJugador[0].id, selJugador[0].nombre, selJugador[0].tipo);
    this.playerBench  = selJugador.slice(1).map(p => this.cartaEmergencia(p.id, p.nombre, p.tipo));

    this.cpuActive = this.cartaEmergencia(selCpu[0].id, selCpu[0].nombre, selCpu[0].tipo);
    this.cpuBench  = selCpu.slice(1).map(p => this.cartaEmergencia(p.id, p.nombre, p.tipo));

    this.agregarLog('⚔️ ¡La batalla comienza!');
    this.agregarLog('💡 Toca tu Pokémon activo para atacar.');
    console.log('[Game] Partida iniciada — cartas aleatorias.');
    this.gameStartTime = Date.now();
    this.totalDamageDealt = 0;

    // Cargar imágenes y stats reales en segundo plano
    this.cargarCartasReales([...selJugador], [...selCpu]);
  }

  private cargarCartasReales(
    selJugador: Array<{ id: number; nombre: string; tipo: string }>,
    selCpu:     Array<{ id: number; nombre: string; tipo: string }>
  ) {
    selJugador.forEach((entry, i) => {
      this.pokemonService.getPokemon(entry.id).subscribe({
        next: (p) => {
          if (i === 0 && this.playerActive?.id === entry.id) {
            p.vidaActual = this.playerActive.vidaActual;
            this.playerActive = p;
          } else {
            const benchIdx = i - 1;
            if (benchIdx >= 0 && this.playerBench[benchIdx]?.id === entry.id) {
              p.vidaActual = this.playerBench[benchIdx].vidaActual;
              this.playerBench[benchIdx] = p;
            }
          }
          console.log(`[Game] Jugador real: ${p.nombre}`);
        },
        error: () => {}
      });
    });

    selCpu.forEach((entry, i) => {
      this.pokemonService.getPokemon(entry.id).subscribe({
        next: (p) => {
          if (i === 0 && this.cpuActive?.id === entry.id) {
            p.vidaActual = this.cpuActive.vidaActual;
            this.cpuActive = p;
          } else {
            const benchIdx = i - 1;
            if (benchIdx >= 0 && this.cpuBench[benchIdx]?.id === entry.id) {
              p.vidaActual = this.cpuBench[benchIdx].vidaActual;
              this.cpuBench[benchIdx] = p;
            }
          }
          console.log(`[Game] CPU real: ${p.nombre}`);
        },
        error: () => {}
      });
    });
  }

  private cartaEmergencia(id: number, nombre: string, tipo: string): PokemonCard {
    const statsMap: Record<string, { hp: number; atk: number; def: number }> = {
      FIRE:     { hp: 650, atk: 300, def: 180 },
      WATER:    { hp: 700, atk: 250, def: 220 },
      GRASS:    { hp: 600, atk: 270, def: 200 },
      ELECTRIC: { hp: 580, atk: 320, def: 160 },
      BUG:      { hp: 550, atk: 240, def: 210 },
      FAIRY:    { hp: 620, atk: 260, def: 230 },
      ROCK:     { hp: 680, atk: 260, def: 250 },
      NORMAL:   { hp: 600, atk: 250, def: 200 },
    };
    const s = statsMap[tipo] ?? { hp: 600, atk: 250, def: 200 };
    return {
      id, nombre,
      imagen: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
      tipo, hp: s.hp, vidaActual: s.hp,
      ataque: s.atk, defensa: s.def,
      rareza: 'Común', descripcion: 'Pokémon Gen 9',
      efectosActivos: [],
      habilidad: {
        nombre: 'Impacto Directo',
        descripcion: 'Genera daño físico básico al oponente.',
        efecto: (u: any, o?: any) => {
          if (o) {
            o.vidaActual -= 150;
            return { log: `${u.nombre} infligió 150 de daño a ${o.nombre}.` };
          }
          return { log: `${u.nombre} atacó al aire.` };
        }
      }
    };
  }

  // ══════════════════════════════════════════
  //  ACCIONES DEL JUGADOR
  //  Toca carta → modal → elige acción
  //  → CPU responde sola automáticamente
  // ══════════════════════════════════════════

  seleccionarCarta(carta: PokemonCard) {
    if (!this.puedeActuarJugador()) return;
    this.soundService.play('click');
    this.cartaSeleccionada = carta;
    this.mostrarMenuAcciones = true;
    console.log('[ONLINE ACTION] carta seleccionada:', carta.nombre,
      '| rol:', this.onlineRol ?? 'local');
  }

  cerrarAcciones() {
    this.soundService.play('click');
    this.cartaSeleccionada = null;
    this.mostrarMenuAcciones = false;
  }

  ejecutarAtaque() {
    if (!this.cartaSeleccionada) return;
    this.soundService.play('attack');

    if (this.isOnline && this.onlineRol === 'guest') {
      // Guest: su atacante es cpuActive, su objetivo es playerActive
      console.log('[ONLINE ACTION] guest ejecutarAtaque →', this.cartaSeleccionada.nombre);
      this.realizarAtaque(this.cartaSeleccionada, 'cpu');
      this.cerrarAcciones();
      this.publicarEstado(`${this.cartaSeleccionada?.nombre ?? '?'} atacó`);
      if (!this.gameOver) this.pasarTurnoOnlineAlHost();
    } else {
      // Host o modo local: atacante es playerActive, objetivo es cpuActive
      console.log('[ONLINE ACTION] host/local ejecutarAtaque →', this.cartaSeleccionada.nombre);
      this.realizarAtaque(this.cartaSeleccionada, 'jugador');
      this.cerrarAcciones();
      if (this.isOnline) {
        this.publicarEstado(`${this.cartaSeleccionada?.nombre ?? '?'} atacó`);
        if (!this.gameOver) this.pasarTurnoOnlineAlGuest();
      } else {
        if (!this.gameOver) this.pasarTurnoCPU();
      }
    }
  }

  ejecutarHabilidad() {
    if (!this.cartaSeleccionada) return;
    this.soundService.play('ability');

    if (this.isOnline && this.onlineRol === 'guest') {
      console.log('[ONLINE ACTION] guest ejecutarHabilidad →', this.cartaSeleccionada.nombre);
      this.realizarHabilidad(this.cartaSeleccionada, 'cpu');
      this.cerrarAcciones();
      this.publicarEstado(`${this.cartaSeleccionada?.nombre ?? '?'} usó habilidad`);
      if (!this.gameOver) this.pasarTurnoOnlineAlHost();
    } else {
      console.log('[ONLINE ACTION] host/local ejecutarHabilidad →', this.cartaSeleccionada.nombre);
      this.realizarHabilidad(this.cartaSeleccionada, 'jugador');
      this.cerrarAcciones();
      if (this.isOnline) {
        this.publicarEstado(`${this.cartaSeleccionada?.nombre ?? '?'} usó habilidad`);
        if (!this.gameOver) this.pasarTurnoOnlineAlGuest();
      } else {
        if (!this.gameOver) this.pasarTurnoCPU();
      }
    }
  }

  /** Cambiar Pokémon activo desde la reserva — también pasa el turno */
  cambiarActiva(carta: PokemonCard) {
    if (!this.puedeActuarJugador()) return;
    this.soundService.play('click');

    if (this.isOnline && this.onlineRol === 'guest') {
      // Guest controla el lado cpu
      console.log('[ONLINE ACTION] guest cambiarActiva →', carta.nombre);
      const anterior = this.cpuActive;
      this.cpuActive = carta;
      this.cpuBench  = this.cpuBench.filter(c => c.id !== carta.id);
      if (anterior) this.cpuBench.push(anterior);
      this.agregarLog(`🔄 [Guest] ${carta.nombre} entra al campo.`);
      this.publicarEstado(`Cambió a ${carta.nombre}`);
      if (!this.gameOver) this.pasarTurnoOnlineAlHost();
    } else {
      // Host o modo local: controla el lado jugador
      const anterior = this.playerActive;
      this.playerActive = carta;
      this.playerBench  = this.playerBench.filter(c => c.id !== carta.id);
      if (anterior) this.playerBench.push(anterior);
      this.agregarLog(`🔄 ${carta.nombre} entra al campo.`);
      setTimeout(() => {
        const el = document.querySelector('.player-card') as HTMLElement | null;
        this.animService.cardEnterAnim(el);
      }, 50);
      if (this.isOnline) {
        this.publicarEstado(`Cambió a ${carta.nombre}`);
        if (!this.gameOver) this.pasarTurnoOnlineAlGuest();
      } else {
        this.pasarTurnoCPU();
      }
    }
  }

  // Alias por compatibilidad
  atacarDirecto() {
    if (!this.puedeActuarJugador() || !this.playerActive) return;
    this.seleccionarCarta(this.playerActive);
  }

  // ══════════════════════════════════════════
  //  TURNO CPU — automático, sin intervención
  // ══════════════════════════════════════════

  pasarTurnoCPU() {
    // En modo online NUNCA ejecutar la IA local — el "turno cpu" es el turno del guest
    if (this.isOnline) return;

    this.turno = 'cpu';
    this.cpuThinking = true;
    this.soundService.play('turnChange');
    this.triggerTurnChangeAnim();
    this.cpuTimer = setTimeout(() => this.ejecutarTurnoCPU(), 1500);
  }

  /**
   * Online: host acaba de actuar → pasa turno al guest (turno = 'cpu').
   * Publica el estado para que el guest lo reciba y sepa que puede actuar.
   */
  private pasarTurnoOnlineAlGuest(): void {
    this.turno = 'cpu';
    this.roundNumber++;
    this.soundService.play('turnChange');
    this.triggerTurnChangeAnim();
    this.agregarLog(`— Ronda ${this.roundNumber} — Turno del Guest`);
    console.log('[TURN] host pasó turno al guest — turno=cpu, ronda', this.roundNumber);
    this.publicarEstado('__turno_guest__');
  }

  /**
   * Online: guest acaba de actuar → pasa turno al host (turno = 'jugador').
   * Publica el estado para que el host lo reciba y sepa que puede actuar.
   */
  private pasarTurnoOnlineAlHost(): void {
    this.turno = 'jugador';
    this.soundService.play('turnChange');
    this.triggerTurnChangeAnim();
    this.agregarLog(`— Turno del Host`);
    console.log('[TURN] guest pasó turno al host — turno=jugador');
    this.publicarEstado('__turno_host__');
  }

  ejecutarTurnoCPU() {
    if (this.gameOver) { this.cpuThinking = false; return; }

    // Si la CPU no tiene activa, promover desde reserva
    if (!this.cpuActive && this.cpuBench.length > 0) {
      this.cpuActive = this.cpuBench.shift()!;
      this.agregarLog(`🔄 CPU envía a ${this.cpuActive.nombre}.`);
    }

    if (this.cpuActive) {
      if (this.estaBloqueada(this.cpuActive)) {
        this.agregarLog(`⏳ ${this.cpuActive.nombre} de la CPU está paralizado.`);
      } else {
        // 30% de probabilidad de usar habilidad
        if (Math.random() < 0.3) {
          this.realizarHabilidad(this.cpuActive, 'cpu');
        } else {
          this.realizarAtaque(this.cpuActive, 'cpu');
        }
      }
    }

    this.verificarGanador();
    if (this.gameOver) { this.cpuThinking = false; return; }

    // Devolver turno al jugador
    this.turno = 'jugador';
    this.cpuThinking = false;
    this.roundNumber++;
    this.soundService.play('turnChange');
    this.triggerTurnChangeAnim();
    this.agregarLog(`— Ronda ${this.roundNumber} —`);
  }

  // ══════════════════════════════════════════
  //  COMBATE
  // ══════════════════════════════════════════

  realizarAtaque(atacante: PokemonCard, bando: 'jugador' | 'cpu') {
    if (this.estaBloqueada(atacante)) {
      this.agregarLog(`❌ ${atacante.nombre} está paralizado.`);
      return;
    }
    const dmg = this.calcularAtaqueFinal(atacante);

    if (bando === 'jugador') {
      if (this.cpuActive) {
        this.infligirDanio(atacante, this.cpuActive, dmg, 'cpu');
      } else {
        // Sin Pokémon activo → daño directo a vida global
        this.cpuLife = Math.max(0, this.cpuLife - dmg);
        this.triggerDamageEffect(dmg, 'cpu');
        this.triggerAttackAnim(atacante.tipo, 'cpu');
        this.mostrarGolpeDirecto(`💥 ¡GOLPE DIRECTO! -${dmg} HP a la CPU.`);
        this.agregarLog(`🎯 Golpe directo a CPU: -${dmg} HP. Vida: ${this.cpuLife}`);
        this.verificarGanador();
      }
    } else {
      if (this.playerActive) {
        this.infligirDanio(atacante, this.playerActive, dmg, 'player');
      } else {
        this.playerLife = Math.max(0, this.playerLife - dmg);
        this.triggerDamageEffect(dmg, 'player');
        this.triggerAttackAnim(atacante.tipo, 'player');
        this.mostrarGolpeDirecto(`💥 ¡GOLPE DIRECTO! -${dmg} HP al jugador.`);
        this.agregarLog(`🚨 Golpe directo al jugador: -${dmg} HP. Vida: ${this.playerLife}`);
        this.verificarGanador();
      }
    }
    // verificarGanador ya se llama dentro de infligirDanio si hay KO
    // Solo llamarlo aquí si no hubo KO (defensor sigue vivo)
  }

  realizarHabilidad(atacante: PokemonCard, bando: 'jugador' | 'cpu') {
    if (this.estaBloqueada(atacante)) return;
    const objetivo = bando === 'jugador'
      ? (this.cpuActive ?? undefined)
      : (this.playerActive ?? undefined);
    const res = atacante.habilidad.efecto(atacante, objetivo);
    this.agregarLog(`✨ [${bando === 'jugador' ? 'HABILIDAD' : 'CPU'}] ${res.log}`);
    this.verificarGanador();
  }

  private infligirDanio(
    atacante: PokemonCard, defensor: PokemonCard,
    dmgBase: number, lado: 'player' | 'cpu'
  ) {
    const impacto = Math.max(dmgBase - this.calcularDefensaFinal(defensor), 80);
    defensor.vidaActual -= impacto;

    // Acumular daño del jugador para estadísticas
    if (lado === 'cpu') this.totalDamageDealt += impacto;

    this.triggerDamageEffect(impacto, lado);
    this.triggerAttackAnim(atacante.tipo, lado);

    // Partículas de impacto en el centro de la pantalla
    const typeColor = this.getTypeColor(atacante.tipo);
    const container = document.querySelector('.battle-zone') as HTMLElement | null;
    if (container) {
      const rect = container.getBoundingClientRect();
      const cx   = rect.width  / 2;
      const cy   = rect.height / 2;
      this.animService.spawnImpactParticles(container, cx, cy, typeColor, 10);
    }

    this.agregarLog(`💥 ${atacante.nombre} → ${defensor.nombre}: ${impacto} daño.`);

    if (defensor.vidaActual <= 0) {
      defensor.vidaActual = 0;
      this.procesarKO(defensor, lado);
    }
  }

  private procesarKO(derrotado: PokemonCard, lado: 'player' | 'cpu') {
    this.mostrarKO(derrotado.nombre);
    this.agregarLog(`💀 ¡${derrotado.nombre} fue derrotado!`);

    if (lado === 'cpu') {
      // Solo poner null la activa de la CPU — NO tocar la del jugador
      this.cpuActive = null;
      if (this.cpuBench.length > 0) {
        setTimeout(() => {
          this.cpuActive = this.cpuBench.shift()!;
          this.agregarLog(`🔄 CPU envía a ${this.cpuActive!.nombre}.`);
        }, 700);
      } else {
        this.agregarLog('⚠️ CPU sin reserva. Ataques van a vida global.');
      }
    } else {
      // Solo poner null la activa del jugador — NO tocar la de la CPU
      this.playerActive = null;
      if (this.playerBench.length > 0) {
        setTimeout(() => {
          this.playerActive = this.playerBench.shift()!;
          this.agregarLog(`🔄 ${this.playerActive!.nombre} entra al campo.`);
        }, 700);
      } else {
        this.agregarLog('⚠️ Sin reserva. Ataques van a tu vida global.');
      }
    }
  }

  // ══════════════════════════════════════════
  //  STATS
  // ══════════════════════════════════════════

  calcularAtaqueFinal(carta: PokemonCard): number {
    let base = carta.ataque;
    carta.efectosActivos?.forEach(e => {
      if (e.modificadorStats?.ataque) base += e.modificadorStats.ataque!;
    });
    return base;
  }

  calcularDefensaFinal(carta: PokemonCard): number {
    let base = carta.defensa;
    carta.efectosActivos?.forEach(e => {
      if (e.modificadorStats?.defensa) base += e.modificadorStats.defensa!;
    });
    return base;
  }

  estaBloqueada(carta: PokemonCard): boolean {
    return carta.efectosActivos?.some(e => e.bloqueaAtaque === true) ?? false;
  }

  // ══════════════════════════════════════════
  //  VICTORIA / DERROTA
  //  Gana quien deje la vida global del otro en 0
  // ══════════════════════════════════════════

  verificarGanador() {
    if (this.cpuLife <= 0) {
      this.terminarJuego('victoria', '🏆 ¡VICTORIA! Redujiste la vida de la CPU a cero.');
    } else if (this.playerLife <= 0) {
      this.terminarJuego('derrota', '💀 DERROTA — Tu vida global llegó a cero.');
    }
  }

  terminarJuego(resultado: 'victoria' | 'derrota' | 'empate', msg: string) {
    this.gameOver  = true;
    this.resultado = resultado;
    this.mensaje   = msg;

    if (resultado === 'victoria') {
      this.soundService.play('victory');
      this.triggerScreenFlash('rgba(201,162,39,0.25)', 600);
    } else if (resultado === 'derrota') {
      this.soundService.play('defeat');
      this.triggerScreenFlash('rgba(255,71,87,0.3)', 600);
    }

    // Publicar fin de partida al oponente online
    if (this.isOnline) {
      this.publicarEstado(`Partida terminada — ganador: ${this.authService.getUsername()}`);
      if (this.roomId) this.onlineRoom.closeRoom(this.roomId);
    }

    this.guardarPartidaEnSupabase(resultado);
  }

  // ══════════════════════════════════════════
  //  ONLINE — Sincronización Supabase Realtime
  // ══════════════════════════════════════════

  /**
   * Publica el estado actual del juego en Supabase.
   * Guard: no publicar mientras isApplyingRemoteState (anti-loop).
   */
  private publicarEstado(lastAction: string): void {
    if (!this.roomId || this.isApplyingRemoteState) return;

    const state: GameState = {
      turno:       this.turno,
      playerLife:  this.playerLife,
      cpuLife:     this.cpuLife,
      roundNumber: this.roundNumber,
      lastAction,
      gameOver:    this.gameOver,
      ganador:     this.gameOver ? this.authService.getUsername() : '',
      timestamp:   Date.now(),
      senderRole:  this.onlineRol ?? ''
    };

    console.log('[ONLINE] publicarEstado →', lastAction,
      '| turno:', state.turno,
      '| rol:', state.senderRole,
      '| ts:', state.timestamp);

    this.onlineRoom.pushState(this.roomId, state);
  }

  private aplicarEstadoRemoto(state: GameState): void {
    // ── Guards en orden estricto ──────────────────────────────────────────
    if (!state || state.playerLife === undefined)    return;
    if (state.lastAction === '__guest_joined__')      return;
    if (this.isApplyingRemoteState)                  return;
    if (state.senderRole === this.onlineRol)         return;  // ignorar propios
    if (state.timestamp <= this.lastRemoteTimestamp) return;  // ignorar viejos

    this.isApplyingRemoteState = true;
    this.lastRemoteTimestamp   = state.timestamp;

    console.log('[REMOTE STATE] recibido de', state.senderRole,
      '| acción:', state.lastAction,
      '| turno remoto:', state.turno,
      '| playerLife:', state.playerLife,
      '| cpuLife:', state.cpuLife);

    try {
      // Efectos visuales de daño ANTES de actualizar HP
      const dmgPlayer = state.playerLife < this.playerLife ? this.playerLife - state.playerLife : 0;
      const dmgCpu    = state.cpuLife    < this.cpuLife    ? this.cpuLife    - state.cpuLife    : 0;

      // Aplicar cambios de estado
      this.playerLife  = state.playerLife;
      this.cpuLife     = state.cpuLife;
      this.roundNumber = state.roundNumber;

      // ── Sincronizar turno ─────────────────────────────────────────────
      // El turno publicado por el oponente es el turno que ELLOS establecieron
      // después de actuar. Lo adoptamos directamente.
      const turnoAnterior = this.turno;
      this.turno = state.turno;

      if (turnoAnterior !== this.turno) {
        this.soundService.play('turnChange');
        this.triggerTurnChangeAnim();
        console.log('[TURN] turno cambió remotamente:', turnoAnterior, '→', this.turno,
          '| esMiTurno:', this.esMiTurnoOnline());
      }

      // Log de la acción del oponente (omitir mensajes internos de turno)
      if (state.lastAction &&
          state.lastAction !== '__turno_guest__' &&
          state.lastAction !== '__turno_host__') {
        const rol = state.senderRole === 'host' ? 'Host' : 'Guest';
        this.agregarLog(`🌐 [${rol}] ${state.lastAction}`);
      }

      if (dmgPlayer > 0) this.triggerDamageEffect(dmgPlayer, 'player');
      if (dmgCpu    > 0) this.triggerDamageEffect(dmgCpu,    'cpu');

      // Fin de partida remoto
      if (state.gameOver && !this.gameOver) {
        const miUsername = this.authService.getUsername();
        const ganamos    = state.ganador !== '' && state.ganador !== miUsername;
        if (ganamos) {
          this.terminarJuego('victoria', '🏆 ¡VICTORIA! Tu oponente fue derrotado.');
        } else {
          this.terminarJuego('derrota', '💀 DERROTA — Tu oponente ganó.');
        }
      }
    } finally {
      queueMicrotask(() => { this.isApplyingRemoteState = false; });
    }
  }

  private guardarPartidaEnSupabase(resultado: 'victoria' | 'derrota' | 'empate') {
    const toEntry = (c: PokemonCard): DeckEntry => ({
      id: c.id, nombre: c.nombre, tipo: c.tipo,
      hp: c.hp, ataque: c.ataque, defensa: c.defensa
    });

    const allPlayer = [
      ...(this.playerActive ? [this.playerActive] : []),
      ...this.playerBench
    ];
    const allCpu = [
      ...(this.cpuActive ? [this.cpuActive] : []),
      ...this.cpuBench
    ];

    // Obtener datos del usuario autenticado (o anónimo)
    const userId   = this.authService.getUserId() ?? undefined;
    const username = this.authService.getUsername();

    const record: GameRecord = {
      player_id:         userId,
      player_username:   username,
      resultado,
      player_life_final: this.playerLife,
      cpu_life_final:    this.cpuLife,
      rounds_played:     this.roundNumber,
      player_deck:       allPlayer.map(toEntry),
      cpu_deck:          allCpu.map(toEntry),
      battle_log:        this.historialLog.slice(0, 50),
      duration_seconds:  Math.round((Date.now() - this.gameStartTime) / 1000)
    };

    // Guardar partida con el nuevo GameService
    this.gameService.saveGame(record).then(({ data, error }) => {
      if (!error && data) {
        console.log('[Game] Partida guardada ID:', data.id);
      }
    });

    // Actualizar estadísticas si el usuario está autenticado
    if (userId) {
      this.statsService.updateStats(userId, resultado, this.totalDamageDealt).then(() => {
        console.log('[Game] Estadísticas actualizadas.');
      });
    }

    // Mantener compatibilidad con el servicio legacy
    this.supabaseService.updatePlayerStats(username, resultado);
  }

  // ══════════════════════════════════════════
  //  ANIMACIONES / UI
  // ══════════════════════════════════════════

  triggerDamageEffect(dmg: number, target: 'player' | 'cpu') {
    this.lastDamage = dmg;
    this.damageTarget = target;
    this.showDamage = true;

    // Screen flash según bando
    const flashColor = target === 'cpu'
      ? 'rgba(255,71,87,0.18)'
      : 'rgba(255,165,2,0.18)';
    this.triggerScreenFlash(flashColor);

    if (target === 'cpu') {
      this.shakeCpu = true;
      setTimeout(() => this.shakeCpu = false, 500);
    } else {
      this.shakePlayer = true;
      setTimeout(() => this.shakePlayer = false, 500);
    }
    setTimeout(() => this.showDamage = false, 900);
  }

  triggerAttackAnim(tipo: string, target: 'player' | 'cpu') {
    this.attackAnimType   = tipo?.toUpperCase() ?? 'NORMAL';
    this.attackAnimTarget = target;
    this.attackAnim       = true;
    clearTimeout(this.attackAnimTimer);
    this.attackAnimTimer = setTimeout(() => this.attackAnim = false, 700);
  }

  /** Flash de pantalla completa — color configurable */
  triggerScreenFlash(color = 'rgba(255,255,255,0.15)', durationMs = 250): void {
    this.screenFlashColor = color;
    this.screenFlash = true;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.screenFlash = false, durationMs);
  }

  /** Animación de cambio de turno en el banner */
  triggerTurnChangeAnim(): void {
    this.turnChangeAnim = true;
    clearTimeout(this.turnAnimTimer);
    this.turnAnimTimer = setTimeout(() => this.turnChangeAnim = false, 600);
  }

  mostrarKO(nombre: string) {
    this.soundService.play('ko');
    this.triggerScreenFlash('rgba(255,71,87,0.25)', 400);
    this.koMessage = `💀 ¡${nombre} fue derrotado!`;
    this.showKo    = true;
    clearTimeout(this.koTimer);
    this.koTimer = setTimeout(() => this.showKo = false, 2000);
  }

  mostrarGolpeDirecto(msg: string) {
    this.soundService.play('directHit');
    this.triggerScreenFlash('rgba(255,165,2,0.22)', 350);
    this.directHitMessage = msg;
    this.showDirectHit    = true;
    clearTimeout(this.directHitTimer);
    this.directHitTimer = setTimeout(() => this.showDirectHit = false, 2200);
  }

  /** Tilt 3D holográfico en hover de carta */
  onCardHover(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    this.animService.applyTilt(el, event);
    this.soundService.play('hover');
  }

  onCardLeave(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    this.animService.resetTilt(el);
  }

  /** Toggle mute desde el template */
  toggleMute(): void {
    this.soundService.toggleMute();
    this.soundService.play('click');
  }

  // ── Helpers de template ──

  puedeActuarJugador(): boolean {
    if (this.gameOver || this.cpuThinking) return false;
    if (this.isOnline) {
      // En modo online: cada jugador actúa en su turno asignado
      const puedo = this.esMiTurnoOnline();
      console.log('[TURN] puedeActuarJugador →', puedo,
        '| rol:', this.onlineRol,
        '| turno:', this.turno);
      return puedo;
    }
    // Modo local: solo actúa en turno 'jugador'
    return this.turno === 'jugador';
  }

  get cpuExposed(): boolean    { return !this.cpuActive    && this.cpuBench.length    === 0; }
  get playerExposed(): boolean { return !this.playerActive && this.playerBench.length === 0; }

  get playerHpPercent(): number { return this.getHpPercent(this.playerLife, this.playerMaxLife); }
  get cpuHpPercent(): number    { return this.getHpPercent(this.cpuLife,    this.cpuMaxLife);    }

  get playerActiveHpPercent(): number {
    return this.playerActive
      ? this.getHpPercent(this.playerActive.vidaActual, this.playerActive.hp)
      : 0;
  }

  get cpuActiveHpPercent(): number {
    return this.cpuActive
      ? this.getHpPercent(this.cpuActive.vidaActual, this.cpuActive.hp)
      : 0;
  }

  getHpPercent(current: number, max: number): number {
    return Math.max(0, Math.min(100, (current / max) * 100));
  }

  getHpColor(percent: number): string {
    if (percent > 60) return '#2ed573';
    if (percent > 30) return '#ffa502';
    return '#ff4757';
  }

  getTypeColor(tipo: string): string {
    const colors: Record<string, string> = {
      FIRE:     '#ff6b35', WATER:    '#4fc3f7', GRASS:    '#66bb6a',
      ELECTRIC: '#ffd54f', PSYCHIC:  '#f48fb1', ICE:      '#80deea',
      DRAGON:   '#7e57c2', DARK:     '#546e7a', FAIRY:    '#f06292',
      FIGHTING: '#ef5350', POISON:   '#ab47bc', GROUND:   '#d4a574',
      FLYING:   '#90caf9', BUG:      '#aed581', ROCK:     '#bcaaa4',
      GHOST:    '#7986cb', STEEL:    '#90a4ae', NORMAL:   '#bdbdbd'
    };
    return colors[tipo?.toUpperCase()] ?? '#bdbdbd';
  }

  getAttackEmoji(tipo: string): string {
    const emojis: Record<string, string> = {
      FIRE:     '🔥', WATER:    '💧', GRASS:    '🌿',
      ELECTRIC: '⚡', ICE:      '❄️', PSYCHIC:  '🔮',
      DARK:     '🌑', GHOST:    '👻', DRAGON:   '🐉',
      FAIRY:    '✨', FIGHTING: '👊', POISON:   '☠️',
      GROUND:   '🌍', FLYING:   '🌪️', BUG:      '🐛',
      ROCK:     '🪨', STEEL:    '⚙️', NORMAL:   '💫',
    };
    return emojis[tipo?.toUpperCase()] ?? '💥';
  }

  agregarLog(texto: string) {
    this.historialLog.unshift(texto);
    if (this.historialLog.length > 30) this.historialLog.pop();
  }

  reiniciarJuego() {
    clearTimeout(this.cpuTimer);
    this.soundService.play('click');
    this.limpiarOnline();
    this.iniciarPartida();
  }

  volverAlMenu() {
    this.soundService.play('click');
    this.limpiarOnline();
    this.router.navigate(['/']);
  }
}
