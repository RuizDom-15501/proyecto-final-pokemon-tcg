import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {

  email    = '';
  password = '';
  error    = signal<string | null>(null);
  loading  = signal(false);
  loadingGoogle = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  // ── Login con email/password ──
  async onSubmit(): Promise<void> {
    if (!this.email || !this.password) {
      this.error.set('Completa todos los campos.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const { error } = await this.authService.signIn(this.email, this.password);

    if (error) {
      this.error.set(this.translateError(error));
    } else {
      this.router.navigate(['/']);
    }

    this.loading.set(false);
  }

  // ── Login con Google OAuth ──
  async loginGoogle(): Promise<void> {
    this.loadingGoogle.set(true);
    this.error.set(null);
    // Redirige al proveedor — el navegador sale de la app
    // La vuelta la maneja onAuthStateChange en auth.service.ts
    await this.authService.loginWithGoogle();
    // Si hay error el servicio lo loguea; aquí reseteamos el spinner
    this.loadingGoogle.set(false);
  }

  private translateError(msg: string): string {
    if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
    if (msg.includes('Email not confirmed'))        return 'Confirma tu email antes de iniciar sesión.';
    if (msg.includes('Too many requests'))          return 'Demasiados intentos. Espera un momento.';
    return msg;
  }
}
