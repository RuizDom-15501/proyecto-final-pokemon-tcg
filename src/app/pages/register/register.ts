import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class RegisterComponent {

  username = '';
  email    = '';
  password = '';
  confirm  = '';
  error    = signal<string | null>(null);
  success  = signal<string | null>(null);
  loading  = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async onSubmit() {
    this.error.set(null);
    this.success.set(null);

    if (!this.username || !this.email || !this.password || !this.confirm) {
      this.error.set('Completa todos los campos.');
      return;
    }

    if (this.username.length < 3) {
      this.error.set('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }

    if (this.password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (this.password !== this.confirm) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }

    this.loading.set(true);

    const { error } = await this.authService.signUp(this.email, this.password, this.username);

    if (error) {
      this.error.set(this.translateError(error));
    } else {
      this.success.set('¡Cuenta creada! Revisa tu email para confirmar tu cuenta.');
      setTimeout(() => this.router.navigate(['/login']), 3000);
    }

    this.loading.set(false);
  }

  private translateError(msg: string): string {
    if (msg.includes('already registered'))  return 'Este email ya está registrado.';
    if (msg.includes('Password should be'))  return 'La contraseña debe tener al menos 6 caracteres.';
    if (msg.includes('Invalid email'))       return 'El email no es válido.';
    return msg;
  }
}
