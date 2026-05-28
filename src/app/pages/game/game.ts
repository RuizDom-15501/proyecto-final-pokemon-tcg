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
import { OnlineRoomService, GameState, CardSnapshot, OnlineSession, GuestIntent } from '../../services/online-room.service';
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
  private roomId:               string | null = null;
  onlineRol:                    'host' | 'guest' | null = null;
  private isApplyingRemoteState = false;
  private lastRemoteTimestamp   = 0;
  private publishTimer:         any = null;
  private antiFreezeTimer:      any = null;  // anti-deadlock watchdog
  roomCode = '';

  // ── HUD online — estado visible para el jugador ──
  onlineSyncStatus: 'idle' | 'syncing' | 'waiting' | 'reconnecting' = 'idle';

  get isOnline(): boolean { return !!this.roomId; }

  /** Texto de estado para el HUD online */
  get onlineTurnLabel(): string {
    if (!this.isOnline) return '';
    if (this.onlineSyncStatus === 'syncing')      return '⏳ Sincronizando...';
    if (this.onlineSyncStatus === 'reconnecting') return '🔄 Reconectando...';
    if (this.esMiTurnoOnline())                   return '⚔️ Tu turno';
    return '⏳ Esperando al rival...';
  }

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
    // Leer queryParams: ?roomId=XXX&rol=host|guest&code=XXXXXX
    const params = this.route.snapshot.queryParamMap;
    let roomId    = params.get('roomId');
    let rol       = params.get('rol') as 'host' | 'guest' | null;
    let code      = params.get('code') ?? '';

    // ── Reconexión desde localStorage si no hay queryParams ────────────
    if (!roomId) {
      const session = this.onlineRoom.loadSession();
      if (session) {
        console.log('[ONLINE] reconectando desde localStorage:', session.roomId);
        roomId = session.roomId;
        rol    = session.onlineRol;
        code   = session.roomCode;
        // Mostrar mensaje de reconexión hasta que llegue el primer estado
        this.onlineSyncStatus = 'reconnecting';
        setTimeout(() => {
          if (this.onlineSyncStatus === 'reconnecting') this.onlineSyncStatus = 'idle';
        }, 5000);
      }
    }

    this.roomId    = roomId;
    this.onlineRol = rol;
    this.roomCode  = code;

    // Persistir sesión si hay sala
    if (this.roomId && this.onlineRol) {
      this.onlineRoom.saveSession({
        roomId:    this.roomId,
        roomCode:  this.roomCode,
        onlineRol: this.onlineRol
      });
    }

    this.iniciarPartida();

    // Si hay sala online, suscribirse a cambios del oponente
    if (this.roomId) {
      this.agregarLog(`🌐 Sala online: ${this.roomCode || this.roomId.slice(0,6).toUpperCase()}`);
      this.onlineRoom.subscribeToRoom(this.roomId, (state: GameState) => {
        this.aplicarEstadoRemoto(state);
      });

      // ── Bug 1: Si es guest, esperar el mazo inicial del host ──────────
      if (this.onlineRol === 'guest') {
        this.cargarMazoDesdeHost();
      }
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.cpuTimer);
    clearTimeout(this.koTimer);
    clearTimeout(this.directHitTimer);
    clearTimeout(this.attackAnimTimer);
    clearTimeout(this.flashTimer);
    clearTimeout(this.turnAnimTimer);
    clearTimeout(this.publishTimer);
    clearTimeout(this.antiFreezeTimer);
    this.limpiarOnline();
  }

  /** Limpia recursos online al salir o reiniciar */
  private limpiarOnline(): void {
    if (this.roomId) {
      this.onlineRoom.unsubscribe();
      this.onlineRoom.clearSession();
      this.roomId = null;
      this.roomCode = '';
      this.onlineRol = null;
      this.isApplyingRemoteState = false;
      this.lastRemoteTimestamp = 0;
      clearTimeout(this.publishTimer);
      clearTimeout(this.antiFreezeTimer);
      this.publishTimer    = null;
      this.antiFreezeTimer = null;
      this.onlineSyncStatus = 'idle';
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

    // ── Bug 1: Host publica el mazo inicial para que el guest lo cargue ──
    if (this.isOnline && this.onlineRol === 'host') {
      // Pequeño delay para que la suscripción del guest esté lista
      setTimeout(() => this.publicarMazoInicial(), 1500);
    }
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
    // Guardar referencia ANTES de cerrarAcciones (que la pone a null)
    const carta  = this.cartaSeleccionada;
    const nombre = carta.nombre;
    const cardId = carta.id;
    this.cerrarAcciones();

    if (this.isOnline && this.onlineRol === 'guest') {
      console.log('[ONLINE ACTION] guest → intent attack:', nombre);
      this.enviarIntencionGuest({ type: 'attack', cardId });
    } else {
      console.log('[ONLINE ACTION] host/local ejecutarAtaque →', nombre);
      this.realizarAtaque(carta, 'jugador');
      if (this.isOnline) {
        if (!this.gameOver) this.pasarTurnoOnlineAlGuest();
        this.publicarEstadoCompleto(`${nombre} atacó`);
      } else {
        if (!this.gameOver) this.pasarTurnoCPU();
      }
    }
  }

  ejecutarHabilidad() {
    if (!this.cartaSeleccionada) return;
    this.soundService.play('ability');
    // Guardar referencia ANTES de cerrarAcciones
    const carta  = this.cartaSeleccionada;
    const nombre = carta.nombre;
    const cardId = carta.id;
    this.cerrarAcciones();

    if (this.isOnline && this.onlineRol === 'guest') {
      console.log('[ONLINE ACTION] guest → intent ability:', nombre);
      this.enviarIntencionGuest({ type: 'ability', cardId });
    } else {
      console.log('[ONLINE ACTION] host/local ejecutarHabilidad →', nombre);
      this.realizarHabilidad(carta, 'jugador');
      if (this.isOnline) {
        if (!this.gameOver) this.pasarTurnoOnlineAlGuest();
        this.publicarEstadoCompleto(`${nombre} usó habilidad`);
      } else {
        if (!this.gameOver) this.pasarTurnoCPU();
      }
    }
  }

  /** Cambiar Pokémon activo desde la reserva */
  cambiarActiva(carta: PokemonCard) {
    if (!this.puedeActuarJugador()) return;
    this.soundService.play('click');

    if (this.isOnline && this.onlineRol === 'guest') {
      // ── GUEST: solo envía intención ─────────────────────────────────────
      console.log('[ONLINE ACTION] guest → intent switch:', carta.nombre);
      this.enviarIntencionGuest({ type: 'switch', cardId: carta.id });
    } else {
      // ── HOST / LOCAL ─────────────────────────────────────────────────────
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
        if (!this.gameOver) this.pasarTurnoOnlineAlGuest();
        this.publicarEstadoCompleto(`Cambió a ${carta.nombre}`);
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
    // En modo online NUNCA ejecutar la IA local
    if (this.isOnline) return;

    this.turno = 'cpu';
    this.cpuThinking = true;
    this.soundService.play('turnChange');
    this.triggerTurnChangeAnim();
    this.cpuTimer = setTimeout(() => this.ejecutarTurnoCPU(), 1500);
  }

  /** Host: acaba de actuar → turno del guest */
  private pasarTurnoOnlineAlGuest(): void {
    this.turno = 'cpu';
    this.roundNumber++;
    this.soundService.play('turnChange');
    this.triggerTurnChangeAnim();
    this.agregarLog(`— Ronda ${this.roundNumber} — Turno del Guest`);
    console.log('[TURN] host → guest | turno=cpu | ronda', this.roundNumber);
  }

  /** Host: procesó acción del guest → turno del host */
  private pasarTurnoOnlineAlHost(): void {
    this.turno = 'jugador';
    this.soundService.play('turnChange');
    this.triggerTurnChangeAnim();
    this.agregarLog(`— Turno del Host`);
    console.log('[TURN] guest → host | turno=jugador');
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
    // Guard: nunca ejecutar con atacante null
    if (!atacante) {
      console.log('[NULL TARGET] realizarAtaque — atacante null, bando:', bando);
      return;
    }
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
  }

  realizarHabilidad(atacante: PokemonCard, bando: 'jugador' | 'cpu') {
    if (!atacante) {
      console.log('[NULL TARGET] realizarHabilidad — atacante null, bando:', bando);
      return;
    }
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
    if (!atacante || !defensor) {
      console.log('[NULL TARGET] infligirDanio — atacante:', atacante?.nombre ?? 'null',
        '| defensor:', defensor?.nombre ?? 'null');
      return;
    }

    const impacto = Math.max(dmgBase - this.calcularDefensaFinal(defensor), 80);
    defensor.vidaActual -= impacto;

    if (lado === 'cpu') this.totalDamageDealt += impacto;

    this.triggerDamageEffect(impacto, lado);
    this.triggerAttackAnim(atacante.tipo, lado);

    const typeColor = this.getTypeColor(atacante.tipo);
    const container = document.querySelector('.battle-zone') as HTMLElement | null;
    if (container) {
      const rect = container.getBoundingClientRect();
      this.animService.spawnImpactParticles(container, rect.width / 2, rect.height / 2, typeColor, 10);
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
    console.log('[KO]', derrotado.nombre, '| lado:', lado,
      '| bench cpu:', this.cpuBench.length, '| bench player:', this.playerBench.length);

    if (lado === 'cpu') {
      // Reemplazo SÍNCRONO — sin setTimeout para evitar estado null durante publish
      if (this.cpuBench.length > 0) {
        this.cpuActive = this.cpuBench.shift()!;
        this.agregarLog(`🔄 CPU envía a ${this.cpuActive.nombre}.`);
        console.log('[KO] cpu reemplazada por:', this.cpuActive.nombre);
      } else {
        this.cpuActive = null;
        this.agregarLog('⚠️ CPU sin reserva. Ataques van a vida global.');
        console.log('[KO] cpu sin reserva — cpuActive = null');
      }
    } else {
      // Reemplazo SÍNCRONO
      if (this.playerBench.length > 0) {
        this.playerActive = this.playerBench.shift()!;
        this.agregarLog(`🔄 ${this.playerActive.nombre} entra al campo.`);
        console.log('[KO] player reemplazado por:', this.playerActive.nombre);
      } else {
        this.playerActive = null;
        this.agregarLog('⚠️ Sin reserva. Ataques van a tu vida global.');
        console.log('[KO] player sin reserva — playerActive = null');
      }
    }

    console.log('[ACTIVE STATE] tras KO | playerActive:', this.playerActive?.nombre ?? 'null',
      '| cpuActive:', this.cpuActive?.nombre ?? 'null');
  }

  estaBloqueada(carta: PokemonCard | null | undefined): boolean {
    if (!carta) return false;
    // efectosActivos puede ser undefined si la carta viene de un snapshot parcial
    return carta.efectosActivos?.some(e => e.bloqueaAtaque === true) ?? false;
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
  //  ONLINE — Host Authoritative State
  // ══════════════════════════════════════════

  // ── Serialización de cartas ─────────────────────────────────────────────
  private toSnapshot(c: PokemonCard): CardSnapshot {
    return {
      id: c.id, nombre: c.nombre, tipo: c.tipo,
      hp: c.hp, vidaActual: c.vidaActual,
      ataque: c.ataque, defensa: c.defensa, imagen: c.imagen
    };
  }

  private fromSnapshotExact(s: CardSnapshot): PokemonCard {
    const c = this.cartaEmergencia(s.id, s.nombre, s.tipo);
    c.hp         = s.hp;
    c.vidaActual = s.vidaActual;
    c.ataque     = s.ataque;
    c.defensa    = s.defensa;
    c.imagen     = s.imagen;
    // Garantizar que efectosActivos siempre sea un array (nunca undefined)
    if (!c.efectosActivos) c.efectosActivos = [];
    return c;
  }

  // ── Host: publica estado completo (cartas + vida + turno) ───────────────
  private publicarEstadoCompleto(lastAction: string): void {
    if (!this.roomId) return;
    // NO bloquear por isApplyingRemoteState — si el flag quedó atascado, publicar igual
    // El guard de senderRole en el receptor evita el eco

    clearTimeout(this.publishTimer);
    this.publishTimer = setTimeout(() => {
      if (!this.roomId) return;

      const state: GameState = {
        turno:        this.turno,
        roundNumber:  this.roundNumber,
        playerLife:   this.playerLife,
        cpuLife:      this.cpuLife,
        playerActive: this.playerActive ? this.toSnapshot(this.playerActive) : null,
        playerBench:  this.playerBench.map(c => this.toSnapshot(c)),
        cpuActive:    this.cpuActive    ? this.toSnapshot(this.cpuActive)    : null,
        cpuBench:     this.cpuBench.map(c => this.toSnapshot(c)),
        lastAction,
        gameOver:     this.gameOver,
        ganador:      this.gameOver ? this.authService.getUsername() : '',
        timestamp:    Date.now(),
        senderRole:   'host'
      };

      console.log('[PUBLISH] host → estado completo | action:', lastAction,
        '| turno:', state.turno, '| ts:', state.timestamp);

      this.onlineSyncStatus = 'syncing';
      this.onlineRoom.pushState(this.roomId!, state).then(() => {
        this.onlineSyncStatus = 'idle';
      });

      // Anti-freeze: si en 8s no llega respuesta del guest, resetear flag
      this.resetAntiFreezeTimer();
    }, 80);
  }

  /** Watchdog: si isApplyingRemoteState queda atascado, liberarlo */
  private resetAntiFreezeTimer(): void {
    clearTimeout(this.antiFreezeTimer);
    this.antiFreezeTimer = setTimeout(() => {
      if (this.isApplyingRemoteState) {
        console.log('[DEADLOCK] anti-freeze: liberando isApplyingRemoteState atascado');
        this.isApplyingRemoteState = false;
        this.onlineSyncStatus = 'idle';
      }
    }, 8000);
  }

  // ── Guest: envía intención al host (no modifica estado local) ───────────
  private enviarIntencionGuest(intent: GuestIntent): void {
    if (!this.roomId) return;

    const state: GameState = {
      turno:        this.turno,
      roundNumber:  this.roundNumber,
      playerLife:   this.playerLife,
      cpuLife:      this.cpuLife,
      playerActive: this.playerActive ? this.toSnapshot(this.playerActive) : null,
      playerBench:  this.playerBench.map(c => this.toSnapshot(c)),
      cpuActive:    this.cpuActive    ? this.toSnapshot(this.cpuActive)    : null,
      cpuBench:     this.cpuBench.map(c => this.toSnapshot(c)),
      lastAction:   `__intent_${intent.type}__`,
      gameOver:     false,
      ganador:      '',
      timestamp:    Date.now(),
      senderRole:   'guest',
      guestIntent:  intent
    };

    console.log('[PUBLISH] guest → intent:', intent.type, '| cardId:', intent.cardId);
    this.onlineRoom.pushState(this.roomId, state);
  }

  // ── Host: publica mazo inicial ──────────────────────────────────────────
  private publicarMazoInicial(): void {
    if (!this.roomId || !this.playerActive || !this.cpuActive) return;

    const state: GameState = {
      turno:        'jugador',
      roundNumber:  1,
      playerLife:   this.playerLife,
      cpuLife:      this.cpuLife,
      playerActive: this.toSnapshot(this.playerActive),
      playerBench:  this.playerBench.map(c => this.toSnapshot(c)),
      cpuActive:    this.toSnapshot(this.cpuActive),
      cpuBench:     this.cpuBench.map(c => this.toSnapshot(c)),
      lastAction:   '__initial_deck__',
      gameOver:     false,
      ganador:      '',
      timestamp:    Date.now(),
      senderRole:   'host',
      initialDeck: {
        playerActive: this.toSnapshot(this.playerActive),
        playerBench:  this.playerBench.map(c => this.toSnapshot(c)),
        cpuActive:    this.toSnapshot(this.cpuActive),
        cpuBench:     this.cpuBench.map(c => this.toSnapshot(c))
      }
    };

    console.log('[SYNC] host publicando mazo inicial');
    this.onlineRoom.pushState(this.roomId, state);
  }

  // ── Guest: polling para cargar mazo inicial del host ────────────────────
  private cargarMazoDesdeHost(): void {
    if (!this.roomId) return;
    console.log('[SYNC] guest esperando mazo inicial...');

    let intentos = 0;
    const poll = setInterval(async () => {
      intentos++;
      const { data } = await this.onlineRoom.getRoomById(this.roomId!);
      const gs = data?.game_state as GameState | null;

      if (gs?.initialDeck && gs.playerActive && gs.cpuActive) {
        clearInterval(poll);
        console.log('[SYNC] guest recibió mazo inicial');
        this.aplicarSnapshotCompleto(gs);
        this.agregarLog('🔄 Tablero sincronizado con el host.');
      } else if (intentos >= 30) {
        clearInterval(poll);
        console.warn('[SYNC] timeout esperando mazo — usando mazo local');
      }
    }, 1000);
  }

  // ── Reconstruir tablero desde snapshot del host ─────────────────────────
  private aplicarSnapshotCompleto(state: GameState): void {
    console.log('[SNAPSHOT] aplicando | playerActive:', state.playerActive?.nombre ?? 'null',
      '| cpuActive:', state.cpuActive?.nombre ?? 'null',
      '| playerBench:', state.playerBench?.length ?? 0,
      '| cpuBench:', state.cpuBench?.length ?? 0);

    this.playerActive = state.playerActive ? this.fromSnapshotExact(state.playerActive) : null;
    this.playerBench  = (state.playerBench ?? []).map(s => this.fromSnapshotExact(s));
    this.cpuActive    = state.cpuActive    ? this.fromSnapshotExact(state.cpuActive)    : null;
    this.cpuBench     = (state.cpuBench    ?? []).map(s => this.fromSnapshotExact(s));

    this.playerLife  = state.playerLife;
    this.cpuLife     = state.cpuLife;
    this.roundNumber = state.roundNumber;
    this.turno       = state.turno;

    console.log('[SNAPSHOT] aplicado | playerActive:', this.playerActive?.nombre ?? 'null',
      '| cpuActive:', this.cpuActive?.nombre ?? 'null',
      '| playerLife:', this.playerLife, '| cpuLife:', this.cpuLife,
      '| turno:', this.turno);
  }

  // ── Host: procesa intención del guest y ejecuta la acción ───────────────
  private procesarIntencionGuest(intent: GuestIntent): void {
    console.log('[SYNC] host procesando intent del guest:', intent.type, '| cardId:', intent.cardId);
    console.log('[ACTIVE STATE] antes de intent | playerActive:', this.playerActive?.nombre ?? 'null',
      '| cpuActive:', this.cpuActive?.nombre ?? 'null');

    if (intent.type === 'attack') {
      // El guest controla el lado cpu — buscar su carta activa
      const carta = (this.cpuActive?.id === intent.cardId)
        ? this.cpuActive
        : (this.cpuBench.find(c => c.id === intent.cardId) ?? this.cpuActive);

      if (!carta) {
        console.log('[NULL TARGET] procesarIntencionGuest attack — cpuActive null, ignorando');
        // Aun así pasar turno y publicar para no congelar
        this.pasarTurnoOnlineAlHost();
        this.publicarEstadoCompleto('[Guest] ataque ignorado (sin activa)');
        return;
      }
      this.realizarAtaque(carta, 'cpu');

    } else if (intent.type === 'ability') {
      const carta = (this.cpuActive?.id === intent.cardId)
        ? this.cpuActive
        : (this.cpuBench.find(c => c.id === intent.cardId) ?? this.cpuActive);

      if (!carta) {
        console.log('[NULL TARGET] procesarIntencionGuest ability — cpuActive null, ignorando');
        this.pasarTurnoOnlineAlHost();
        this.publicarEstadoCompleto('[Guest] habilidad ignorada (sin activa)');
        return;
      }
      this.realizarHabilidad(carta, 'cpu');

    } else if (intent.type === 'switch') {
      const nueva = this.cpuBench.find(c => c.id === intent.cardId);
      if (nueva) {
        const anterior = this.cpuActive;
        this.cpuActive = nueva;
        this.cpuBench  = this.cpuBench.filter(c => c.id !== nueva.id);
        if (anterior) this.cpuBench.push(anterior);
        this.agregarLog(`🔄 [Guest] ${nueva.nombre} entra al campo.`);
        console.log('[SYNC] guest switch → cpuActive:', nueva.nombre);
      } else {
        console.log('[NULL TARGET] procesarIntencionGuest switch — carta no encontrada en bench');
      }
    }

    this.verificarGanador();

    console.log('[ACTIVE STATE] tras intent | playerActive:', this.playerActive?.nombre ?? 'null',
      '| cpuActive:', this.cpuActive?.nombre ?? 'null');

    this.pasarTurnoOnlineAlHost();
    this.publicarEstadoCompleto(`[Guest] ${intent.type}`);
  }

  // ── Receptor de eventos realtime ────────────────────────────────────────
  private aplicarEstadoRemoto(state: GameState): void {
    if (!state || state.playerLife === undefined)    return;
    if (state.lastAction === '__guest_joined__')      return;
    if (state.senderRole === this.onlineRol)         return;  // ignorar propios
    if (state.timestamp <= this.lastRemoteTimestamp) return;  // ignorar viejos

    // Si el flag está activo, liberarlo antes de continuar (evita deadlock)
    if (this.isApplyingRemoteState) {
      console.log('[DEADLOCK] aplicarEstadoRemoto — flag activo, forzando liberación');
      this.isApplyingRemoteState = false;
    }

    this.isApplyingRemoteState = true;
    this.lastRemoteTimestamp   = state.timestamp;
    this.onlineSyncStatus      = 'syncing';

    console.log('[REMOTE] de', state.senderRole,
      '| action:', state.lastAction,
      '| turno:', state.turno,
      '| playerLife:', state.playerLife, '| cpuLife:', state.cpuLife);

    try {
      // ── HOST recibe intención del guest → procesa y publica ─────────────
      if (this.onlineRol === 'host' && state.guestIntent) {
        this.isApplyingRemoteState = false;
        this.onlineSyncStatus = 'idle';
        this.procesarIntencionGuest(state.guestIntent);
        return;
      }

      // ── GUEST recibe estado completo del host → aplica snapshot ─────────
      if (this.onlineRol === 'guest' && state.senderRole === 'host') {
        if (state.lastAction === '__initial_deck__') {
          this.isApplyingRemoteState = false;
          this.onlineSyncStatus = 'idle';
          return;
        }

        const dmgPlayer = state.playerLife < this.playerLife ? this.playerLife - state.playerLife : 0;
        const dmgCpu    = state.cpuLife    < this.cpuLife    ? this.cpuLife    - state.cpuLife    : 0;

        this.aplicarSnapshotCompleto(state);

        if (dmgPlayer > 0) this.triggerDamageEffect(dmgPlayer, 'player');
        if (dmgCpu    > 0) this.triggerDamageEffect(dmgCpu,    'cpu');

        if (state.lastAction && !state.lastAction.startsWith('__')) {
          this.agregarLog(`🌐 [Host] ${state.lastAction}`);
        }

        this.soundService.play('turnChange');
        this.triggerTurnChangeAnim();

        console.log('[ONLINE TURN] guest aplicó estado | turno:', this.turno,
          '| esMiTurno:', this.esMiTurnoOnline());

        if (state.gameOver && !this.gameOver) {
          const miUsername = this.authService.getUsername();
          const ganamos    = state.ganador !== '' && state.ganador !== miUsername;
          this.terminarJuego(
            ganamos ? 'victoria' : 'derrota',
            ganamos ? '🏆 ¡VICTORIA! Tu oponente fue derrotado.' : '💀 DERROTA — Tu oponente ganó.'
          );
        }
      }
    } finally {
      // Liberar flag inmediatamente — no con setTimeout para evitar deadlocks
      this.isApplyingRemoteState = false;
      this.onlineSyncStatus = 'idle';
      clearTimeout(this.antiFreezeTimer);
    }
  }

  // ── Compatibilidad: publicarEstado (alias para host) ────────────────────
  private publicarEstado(lastAction: string): void {
    this.publicarEstadoCompleto(lastAction);
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
