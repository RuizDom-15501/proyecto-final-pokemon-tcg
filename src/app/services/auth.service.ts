import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../core/supabase';

@Injectable({ providedIn: 'root' })
export class AuthService {

  // ── Estado reactivo con signals ──
  currentUser = signal<User | null>(null);
  session      = signal<Session | null>(null);
  isLoading    = signal<boolean>(false);

  // ── Datos de perfil derivados (Google o email) ──
  readonly avatarUrl = computed<string | null>(() => {
    const meta = this.currentUser()?.user_metadata;
    return meta?.['avatar_url'] ?? meta?.['picture'] ?? null;
  });

  readonly displayName = computed<string>(() => {
    const meta = this.currentUser()?.user_metadata;
    return (
      meta?.['full_name']  ??
      meta?.['name']       ??
      meta?.['username']   ??
      this.currentUser()?.email?.split('@')[0] ??
      'Jugador'
    );
  });

  constructor(private router: Router) {
    // 1. Restaurar sesión persistente al arrancar
    this.initSession();

    // 2. Listener permanente — detecta login, logout y refresh de token
    supabase.auth.onAuthStateChange((event: AuthChangeEvent, sess: Session | null) => {
      this.session.set(sess);
      this.currentUser.set(sess?.user ?? null);
      console.log('[Auth]', event, sess?.user?.email ?? 'sin usuario');

      // Redirigir al home tras callback de OAuth (Google)
      if (event === 'SIGNED_IN' && sess?.user) {
        this.ensureUserProfile(sess.user);
        // Solo redirigir si venimos del callback de OAuth
        if (window.location.pathname === '/') return; // ya en home
        this.router.navigate(['/']);
      }

      if (event === 'SIGNED_OUT') {
        this.router.navigate(['/login']);
      }
    });
  }

  private async initSession(): Promise<void> {
    const { data } = await supabase.auth.getSession();
    this.session.set(data.session);
    this.currentUser.set(data.session?.user ?? null);
  }

  // ── Crea perfil en tabla usuarios si no existe (Google o email) ──
  private async ensureUserProfile(user: User): Promise<void> {
    const meta = user.user_metadata;
    const username =
      meta?.['username']  ??
      meta?.['full_name'] ??
      meta?.['name']      ??
      user.email?.split('@')[0] ??
      'Jugador';

    await supabase.from('usuarios').upsert(
      { id: user.id, email: user.email ?? '', username },
      { onConflict: 'id', ignoreDuplicates: true }
    );

    await supabase.from('estadisticas').upsert(
      { user_id: user.id, victorias: 0, derrotas: 0, winrate: 0, damage_total: 0 },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
  }

  // ══════════════════════════════════════════
  //  GOOGLE OAUTH
  // ══════════════════════════════════════════

  async loginWithGoogle(): Promise<void> {
    this.isLoading.set(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,   // → http://localhost:4200
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) {
      console.error('[Auth] Google OAuth error:', error.message);
    }
    // isLoading se resetea cuando el navegador vuelve del redirect
    this.isLoading.set(false);
  }

  // ══════════════════════════════════════════
  //  REGISTRO CON EMAIL
  // ══════════════════════════════════════════

  async signUp(email: string, password: string, username: string): Promise<{ error: string | null }> {
    this.isLoading.set(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });
      if (error) return { error: error.message };

      if (data.user) {
        await this.ensureUserProfile(data.user);
      }
      return { error: null };
    } catch (e: any) {
      return { error: e.message ?? 'Error desconocido' };
    } finally {
      this.isLoading.set(false);
    }
  }

  // ══════════════════════════════════════════
  //  LOGIN CON EMAIL
  // ══════════════════════════════════════════

  async signIn(email: string, password: string): Promise<{ error: string | null }> {
    this.isLoading.set(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e.message ?? 'Error desconocido' };
    } finally {
      this.isLoading.set(false);
    }
  }

  // ══════════════════════════════════════════
  //  LOGOUT
  // ══════════════════════════════════════════

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
    this.currentUser.set(null);
    this.session.set(null);
    // La redirección la maneja el onAuthStateChange (SIGNED_OUT)
  }

  // ══════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════

  isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }

  getUserId(): string | null {
    return this.currentUser()?.id ?? null;
  }

  /** Nombre para mostrar: prioriza Google full_name → username → email prefix */
  getUsername(): string {
    return this.displayName();
  }

  getEmail(): string | null {
    return this.currentUser()?.email ?? null;
  }

  /** URL del avatar de Google (o null si es cuenta email) */
  getAvatarUrl(): string | null {
    return this.avatarUrl();
  }
}
