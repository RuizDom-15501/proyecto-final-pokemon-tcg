import { Routes } from '@angular/router';

import { HomeComponent }       from './pages/home/home';
import { LoginComponent }      from './pages/login/login';
import { RegisterComponent }   from './pages/register/register';
import { DeckComponent }       from './pages/deck/deck.component';
import { GameComponent }       from './pages/game/game';
import { OnlineComponent }     from './pages/online/online';
import { HowToPlayComponent }  from './pages/how-to-play/how-to-play';
import { PokedexComponent }    from './pages/pokedex/pokedex';
import { authGuard }           from './guards/auth.guard';

export const routes: Routes = [

  { path: '',            component: HomeComponent,      pathMatch: 'full' },
  { path: 'login',       component: LoginComponent     },
  { path: 'register',    component: RegisterComponent  },
  { path: 'how-to-play', component: HowToPlayComponent },
  { path: 'pokedex',     component: PokedexComponent   },

  // Rutas que requieren autenticación
  { path: 'deck',   component: DeckComponent,   canActivate: [authGuard] },
  { path: 'online', component: OnlineComponent, canActivate: [authGuard] },

  // El juego no requiere auth para poder jugar sin cuenta
  { path: 'game',   component: GameComponent },

  // Fallback
  { path: '**', redirectTo: '' }
];
