import type { Routes } from '@angular/router';

export const CONFIGURACION_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'horario' },
  {
    path: 'horario',
    title: 'Horario',
    loadComponent: () => import('./horario/horario.component').then((modulo) => modulo.HorarioComponent),
  },
  {
    path: 'envios',
    title: 'Envíos',
    loadComponent: () => import('./envios/envios.component').then((modulo) => modulo.EnviosComponent),
  },
  {
    path: 'gasto-llm',
    title: 'Gasto del LLM',
    loadComponent: () => import('./gasto-llm/gasto-llm.component').then((modulo) => modulo.GastoLlmComponent),
  },
];
