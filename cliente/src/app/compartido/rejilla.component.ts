import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Rejilla fluida: tantas columnas como quepan con el ancho mínimo `--luxe-rejilla-min` (17rem por defecto).
 * `minimo` lo cambia solo para esta rejilla (por ejemplo, `22rem` para tarjetas más anchas). Dentro de una ventana
 * deja un respiro arriba y abajo para que el contorno y la sombra de las tarjetas no se recorten.
 */
@Component({
  selector: 'app-rejilla',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--luxe-rejilla-min]': 'minimo()' },
  template: '<ng-content />',
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--luxe-rejilla-min, 17rem)), 1fr));
      gap: var(--luxe-rejilla-hueco, 1rem);
    }
    /*
     * Dentro de una ventana el contenido desplazable recorta lo que sobresale: un respiro arriba y abajo deja ver
     * la sombra de la tarjeta bajo el mouse y su primera fila completa.
     */
    :host-context(.mat-mdc-dialog-content) {
      padding-block: var(--luxe-espacio-s, 0.5rem);
    }
  `,
})
export class RejillaComponent {
  readonly minimo = input<string | null>(null);
}
