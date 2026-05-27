import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent {
  particles = Array.from({ length: 20 }, () => ({
    x:     Math.random() * 100,
    y:     Math.random() * 100,
    delay: Math.random() * 5,
    size:  Math.random() * 4 + 2
  }));

  constructor(
    public  authService: AuthService,
    private router: Router
  ) {}

  playSolo()   { this.router.navigate(['/game']);   }
  playOnline() { this.router.navigate(['/online']); }
  goToDeck()   { this.router.navigate(['/deck']);   }
  goToLogin()  { this.router.navigate(['/login']);  }

  async logout() {
    await this.authService.signOut();
  }
}
