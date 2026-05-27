import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, timeout, catchError, throwError } from 'rxjs';
import { PokemonCard } from '../models/pokemon-card';

/** Genera un ID único garantizado, con fallback si crypto.randomUUID no está disponible */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

@Injectable({
  providedIn: 'root'
})
export class PokemonService {
  private apiUrl = 'https://pokeapi.co/api/v2/pokemon/';

  constructor(private http: HttpClient) {}

  getPokemon(id: number): Observable<PokemonCard> {
    return this.http.get<any>(`${this.apiUrl}${id}`).pipe(
      timeout(8000), // 8 segundos máximo por petición
      catchError(err => {
        console.warn(`[PokemonService] ❌ Falló ID ${id}:`, err?.message ?? err);
        return throwError(() => err);
      }),
      map((data: any): PokemonCard => {
        const hpStat = data.stats.find((s: any) => s.stat.name === 'hp')?.base_stat || 60;
        const atkStat = data.stats.find((s: any) => s.stat.name === 'attack')?.base_stat || 50;
        const defStat = data.stats.find((s: any) => s.stat.name === 'defense')?.base_stat || 50;
        const tipoPrimario = data.types[0]?.type.name.toUpperCase() || 'NORMAL';

        // Variables para armar la habilidad temporal
        let habNombre = 'Impacto Directo';
        let habDesc = 'Genera daño físico básico al oponente.';
        let habEfecto = (usuario: any, objetivo?: any) => {
          if (objetivo) {
            objetivo.vidaActual -= 150;
            return { log: `${usuario.nombre} usó Impacto Directo e infligió 150 de daño fijo a ${objetivo.nombre}.` };
          }
          return { log: `${usuario.nombre} atacó al aire.` };
        };

        // Asignación de habilidades según tipo elemental
        if (tipoPrimario === 'ELECTRIC') {
          habNombre = 'Onda Trueno';
          habDesc = 'Paraliza al primer enemigo del campo reduciendo su ataque.';
          habEfecto = (usuario: any, objetivo?: any) => {
            if (objetivo) {
              if (!objetivo.efectosActivos) objetivo.efectosActivos = [];
              // Evitar duplicar Parálisis: eliminar la anterior antes de aplicar la nueva
              objetivo.efectosActivos = objetivo.efectosActivos.filter(
                (e: any) => e.nombre !== 'Parálisis'
              );
              objetivo.efectosActivos.push({
                id: genId(),
                nombre: 'Parálisis',
                tipo: 'debuff',
                duracionTurnos: 2,
                bloqueaAtaque: true,
                descripcion: 'No puede atacar'
              });
              return { log: `${usuario.nombre} paralizó a ${objetivo.nombre} por 2 turnos.` };
            }
            return { log: `${usuario.nombre} falló la descarga.` };
          };
        } else if (tipoPrimario === 'GRASS' || tipoPrimario === 'POISON') {
          habNombre = 'Esporas Tóxicas';
          habDesc = 'Envenena al rival restándole vida de forma constante.';
          habEfecto = (usuario: any, objetivo?: any) => {
            if (objetivo) {
              if (!objetivo.efectosActivos) objetivo.efectosActivos = [];
              // Evitar duplicar Veneno: eliminar el anterior antes de aplicar el nuevo
              objetivo.efectosActivos = objetivo.efectosActivos.filter(
                (e: any) => e.nombre !== 'Veneno'
              );
              objetivo.efectosActivos.push({
                id: genId(),
                nombre: 'Veneno',
                tipo: 'debuff',
                duracionTurnos: 3,
                danioPorTurno: 100,
                descripcion: 'Pierde HP cada turno'
              });
              return { log: `${usuario.nombre} envenenó gravemente a ${objetivo.nombre}.` };
            }
            return { log: `${usuario.nombre} esparció esporas.` };
          };
        }

        return {
          id: data.id,
          nombre: data.name.toUpperCase(),
          imagen: data.sprites.other['official-artwork'].front_default || data.sprites.front_default,
          tipo: tipoPrimario,
          hp: hpStat * 10,
          rareza: 'Común',
          descripcion: 'Un Pokémon salvaje',
          vidaActual: hpStat * 10,
          ataque: atkStat * 5,
          defensa: defStat * 5,
          efectosActivos: [],
          habilidad: { 
            nombre: habNombre, 
            descripcion: habDesc, 
            efecto: habEfecto 
          }
        };
      })
    );
  }
}