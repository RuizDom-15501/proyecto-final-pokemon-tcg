import { Routes } from '@angular/router';

import { HomeComponent }     from './pages/home/home';
import { LoginComponent }    from './pages/login/login';
import { RegisterComponent } from './pages/register/register';
import { DeckComponent }     from './pages/deck/deck.component';
import { GameComponent }     from './pages/game/game';
import { OnlineComponent }   from './pages/online/online';
import { authGuard }         from './guards/auth.guard';

export const routes: Routes = [

  { path: '',        component: HomeComponent,     pathMatch: 'full' },
  { path: 'login',   component: LoginComponent    },
  { path: 'register',component: RegisterComponent },

  // Rutas que requieren autenticación
  { path: 'deck',    component: DeckComponent,   canActivate: [authGuard] },
  { path: 'online',  component: OnlineComponent, canActivate: [authGuard] },

  // El juego solo requiere auth si quieres guardar partidas;
  // lo dejamos libre para que se pueda jugar sin cuenta
  { path: 'game',    component: GameComponent },

  // Fallback
  { path: '**',      redirectTo: '' }
];
