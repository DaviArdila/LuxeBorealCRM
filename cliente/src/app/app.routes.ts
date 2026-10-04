import type { Routes } from '@angular/router';
import { REGISTRO_DE_AREAS } from './areas/registro/registro';
import { guardiaDeRol, guardiaDeSesion } from './nucleo/guardias';
import { InicioComponent } from './shell/inicio.component';
import { NoEncontradoComponent } from './shell/no-encontrado.component';
import { ShellComponent } from './shell/shell.component';

/**
 * Inicio de sesión público; el resto, dentro del shell y tras la guardia de sesión. Una ruta diferida
 * por área del registro (D9), con la guardia de rol de esa área.
 */
export const routes: Routes = [
  {
    path: 'entrar',
    title: 'Entrar',
    loadComponent: () => import('./sesion/entrar.component').then((modulo) => modulo.EntrarComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [guardiaDeSesion],
    children: [
      { path: '', pathMatch: 'full', title: 'Inicio', component: InicioComponent },
      ...REGISTRO_DE_AREAS.map((area) => ({
        path: area.id,
        canActivate: [guardiaDeRol(area.roles)],
        loadChildren: area.rutas,
      })),
      { path: '**', title: 'No encontrada', component: NoEncontradoComponent },
    ],
  },
];
