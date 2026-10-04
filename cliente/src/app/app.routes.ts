import type { Routes } from '@angular/router';
import { REGISTRO_DE_AREAS } from './areas/registro/registro';
import { ShellComponent } from './shell/shell.component';

/** Una ruta diferida por área del registro, dentro del shell (D9). */
export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: REGISTRO_DE_AREAS.map((area) => ({ path: area.id, loadChildren: area.rutas })),
  },
];
