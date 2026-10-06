import type { Routes } from '@angular/router';

export const ASISTENTE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'casos' },
  {
    path: 'casos',
    title: 'Casos de uso',
    loadComponent: () => import('./casos/casos.component').then((modulo) => modulo.CasosComponent),
  },
  {
    path: 'estilo',
    title: 'Estilo del bot',
    loadComponent: () => import('./estilo/estilo.component').then((modulo) => modulo.EstiloComponent),
  },
];
