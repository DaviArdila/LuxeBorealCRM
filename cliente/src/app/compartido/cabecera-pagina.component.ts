import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * Cabecera de página: título (`<h1>`), un ícono de ayuda que muestra el texto explicativo en un globo (al pasar
 * el mouse, con el foco o al pulsar) y una ranura para las acciones de la pantalla (Nuevo, Historial, etc.).
 * El texto de ayuda llega por entrada: el componente no conoce ninguna pantalla.
 */
@Component({
  selector: 'app-cabecera-pagina',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatIconButton, MatTooltip],
  template: `
    <div class="titulo">
      <h1>{{ titulo() }}</h1>
      @if (ayuda(); as texto) {
        <button mat-icon-button type="button" data-accion="ayuda" #globo="matTooltip" [matTooltip]="texto"
          matTooltipClass="luxe-ayuda" matTooltipPosition="below" [attr.aria-label]="'Ayuda sobre ' + titulo()"
          (click)="globo.toggle()">
          <mat-icon fontIcon="help" aria-hidden="true" />
        </button>
      }
    </div>
    <div class="acciones"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--luxe-espacio-s, 0.5rem) var(--luxe-espacio-m, 1rem);
    }
    .titulo,
    .acciones {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--luxe-espacio-s, 0.5rem);
    }
    h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
    }
  `,
})
export class CabeceraPaginaComponent {
  readonly titulo = input.required<string>();
  /** Texto explicativo de la pantalla; sin texto no se muestra el ícono. */
  readonly ayuda = input<string | null>(null);
}
