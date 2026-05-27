import { Injectable } from '@angular/core';

type SoundKey =
  | 'attack'
  | 'ability'
  | 'ko'
  | 'victory'
  | 'defeat'
  | 'click'
  | 'hover'
  | 'turnChange'
  | 'directHit';

@Injectable({ providedIn: 'root' })
export class SoundService {

  private ctx: AudioContext | null = null;
  private masterVolume = 0.4;
  private muted = false;

  // Inicializar AudioContext (requiere gesto del usuario)
  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setVolume(v: number): void { this.masterVolume = Math.max(0, Math.min(1, v)); }
  toggleMute(): void { this.muted = !this.muted; }
  isMuted(): boolean { return this.muted; }

  play(key: SoundKey): void {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      switch (key) {
        case 'click':       this.beep(ctx, 880, 0.05, 'sine',    0.08); break;
        case 'hover':       this.beep(ctx, 660, 0.03, 'sine',    0.04); break;
        case 'attack':      this.attackSound(ctx);                       break;
        case 'ability':     this.abilitySound(ctx);                      break;
        case 'ko':          this.koSound(ctx);                           break;
        case 'directHit':   this.directHitSound(ctx);                    break;
        case 'turnChange':  this.beep(ctx, 440, 0.1, 'triangle', 0.15); break;
        case 'victory':     this.victorySound(ctx);                      break;
        case 'defeat':      this.defeatSound(ctx);                       break;
      }
    } catch (_) { /* AudioContext no disponible */ }
  }

  private beep(
    ctx: AudioContext,
    freq: number,
    vol: number,
    type: OscillatorType,
    duration: number
  ): void {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol * this.masterVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  private attackSound(ctx: AudioContext): void {
    // Impacto: ruido blanco corto + tono bajo
    const bufSize = ctx.sampleRate * 0.08;
    const buf     = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data    = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;

    const src  = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(this.masterVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    src.start();

    this.beep(ctx, 120, 0.3, 'sawtooth', 0.12);
  }

  private abilitySound(ctx: AudioContext): void {
    [440, 550, 660, 880].forEach((f, i) => {
      setTimeout(() => this.beep(ctx, f, 0.15, 'sine', 0.2), i * 60);
    });
  }

  private koSound(ctx: AudioContext): void {
    // Descenso dramático
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.3 * this.masterVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  }

  private directHitSound(ctx: AudioContext): void {
    this.beep(ctx, 200, 0.4, 'square', 0.1);
    setTimeout(() => this.beep(ctx, 150, 0.3, 'sawtooth', 0.15), 80);
  }

  private victorySound(ctx: AudioContext): void {
    const melody = [523, 659, 784, 1047];
    melody.forEach((f, i) => {
      setTimeout(() => this.beep(ctx, f, 0.2, 'sine', 0.3), i * 120);
    });
  }

  private defeatSound(ctx: AudioContext): void {
    const melody = [392, 349, 294, 220];
    melody.forEach((f, i) => {
      setTimeout(() => this.beep(ctx, f, 0.15, 'triangle', 0.35), i * 150);
    });
  }
}
