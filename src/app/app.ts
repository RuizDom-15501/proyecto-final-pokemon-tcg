import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './components/navbar/navbar';
import { SplashComponent } from './components/splash/splash';

@Component({
  selector: 'app-root',
  standalone: true,
  // SplashComponent se usa en el template con <app-splash> dentro de @if
  imports: [CommonModule, RouterOutlet, Navbar, SplashComponent],
  template: `
    @if (showSplash()) {
      <app-splash (done)="onSplashDone()"></app-splash>
    }
    <app-navbar></app-navbar>
    <main class="app-main">
      <router-outlet></router-outlet>
    </main>
  `,
  styleUrl: './app.css'
})
export class App {
  /** true mientras la splash está visible */
  showSplash = signal(true);

  onSplashDone(): void {
    this.showSplash.set(false);
  }
}
