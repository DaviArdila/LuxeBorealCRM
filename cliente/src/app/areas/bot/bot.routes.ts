import type { Routes } from '@angular/router';

export const BOT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'estilo' },
  {
    path: 'estilo',
    title: 'Estilo del bot',
    loadComponent: () => import('./estilo/estilo.component').then((modulo) => modulo.EstiloComponent),
  },
  {
    path: 'mensajes-fijos',
    title: 'Mensajes fijos',
    loadComponent: () =>
      import('./mensajes-fijos/mensajes-fijos.component').then((modulo) => modulo.MensajesFijosComponent),
  },
];
