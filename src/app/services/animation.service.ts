import { Injectable } from '@angular/core';

export type AnimationType = 'attack' | 'impact' | 'ko' | 'cardIn' | 'turnChange' | 'victory' | 'defeat';

@Injectable({ providedIn: 'root' })
export class AnimationService {

  // ── Añade clase CSS temporalmente a un elemento ──
  addClassTemp(el: HTMLElement | null, cls: string, durationMs = 600): void {
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), durationMs);
  }

  // ── Shake de impacto ──
  shake(el: HTMLElement | null, intensity: 'light' | 'medium' | 'heavy' = 'medium'): void {
    if (!el) return;
    const cls = `shake-${intensity}`;
    this.addClassTemp(el, cls, 500);
  }

  // ── Flash de color ──
  flash(el: HTMLElement | null, color: string, durationMs = 300): void {
    if (!el) return;
    const prev = el.style.boxShadow;
    el.style.transition = 'box-shadow 0.1s ease';
    el.style.boxShadow = `0 0 40px ${color}, inset 0 0 20px ${color}`;
    setTimeout(() => {
      el.style.boxShadow = prev;
    }, durationMs);
  }

  // ── Partículas de impacto (DOM puro, sin librerías) ──
  spawnImpactParticles(
    container: HTMLElement | null,
    x: number,
    y: number,
    color: string,
    count = 8
  ): void {
    if (!container) return;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'impact-particle';
      p.style.cssText = `
        position:absolute;
        left:${x}px; top:${y}px;
        width:6px; height:6px;
        border-radius:50%;
        background:${color};
        box-shadow:0 0 6px ${color};
        pointer-events:none;
        z-index:9999;
        transform:translate(-50%,-50%);
      `;
      container.appendChild(p);

      const angle = (i / count) * Math.PI * 2;
      const dist  = 40 + Math.random() * 60;
      const dx    = Math.cos(angle) * dist;
      const dy    = Math.sin(angle) * dist;

      p.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: '1' },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)`, opacity: '0' }
      ], { duration: 500 + Math.random() * 300, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => p.remove();
    }
  }

  // ── Animación de entrada de carta ──
  cardEnterAnim(el: HTMLElement | null): void {
    if (!el) return;
    el.animate([
      { opacity: '0', transform: 'translateY(30px) scale(0.85)' },
      { opacity: '1', transform: 'translateY(0) scale(1)' }
    ], { duration: 400, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'forwards' });
  }

  // ── Animación KO ──
  koAnim(el: HTMLElement | null): Promise<void> {
    if (!el) return Promise.resolve();
    return new Promise(resolve => {
      el.animate([
        { opacity: '1', transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
        { opacity: '1', transform: 'scale(1.1) rotate(-3deg)', filter: 'brightness(2) saturate(0)' },
        { opacity: '0', transform: 'scale(0.5) rotate(10deg) translateY(30px)', filter: 'brightness(0)' }
      ], { duration: 700, easing: 'ease-in', fill: 'forwards' })
        .onfinish = () => resolve();
    });
  }

  // ── Tilt 3D en hover (para cartas holográficas) ──
  applyTilt(el: HTMLElement, e: MouseEvent): void {
    const rect   = el.getBoundingClientRect();
    const cx     = rect.left + rect.width  / 2;
    const cy     = rect.top  + rect.height / 2;
    const dx     = (e.clientX - cx) / (rect.width  / 2);
    const dy     = (e.clientY - cy) / (rect.height / 2);
    const rotX   = -dy * 12;
    const rotY   =  dx * 12;
    const shine  = `radial-gradient(circle at ${((dx + 1) / 2) * 100}% ${((dy + 1) / 2) * 100}%, rgba(255,255,255,0.25) 0%, transparent 60%)`;

    el.style.transform    = `perspective(600px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.04)`;
    el.style.transition   = 'transform 0.05s ease';
    el.style.setProperty('--holo-shine', shine);
  }

  resetTilt(el: HTMLElement): void {
    el.style.transform  = '';
    el.style.transition = 'transform 0.4s ease';
    el.style.setProperty('--holo-shine', 'none');
  }
}
