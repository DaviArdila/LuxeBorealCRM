import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SesionServicio } from '../nucleo/sesion.servicio';

@Component({
  selector: 'app-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Hola, {{ sesion.usuario()?.nombre }}</h1><p>Elige una pantalla del menú.</p>',
})
export class InicioComponent {
  protected readonly sesion = inject(SesionServicio);
}
