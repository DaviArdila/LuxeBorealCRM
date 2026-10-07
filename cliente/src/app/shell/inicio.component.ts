import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CabeceraPaginaComponent } from '../compartido/cabecera-pagina.component';
import { SesionServicio } from '../nucleo/sesion.servicio';

@Component({
  selector: 'app-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CabeceraPaginaComponent],
  template: `
    <app-cabecera-pagina [titulo]="'Hola, ' + (sesion.usuario()?.nombre ?? '')" />
    <p class="sugerencia">Elige una pantalla del menú.</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-m);
    }
    .sugerencia {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class InicioComponent {
  protected readonly sesion = inject(SesionServicio);
}
