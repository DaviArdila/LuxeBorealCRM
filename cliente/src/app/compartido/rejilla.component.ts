import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Rejilla fluida: tantas columnas como quepan con el ancho mínimo `--luxe-rejilla-min` (17rem por defecto).
 * `minimo` lo cambia solo para esta rejilla (por ejemplo, `22rem` para tarjetas más anchas).
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
  `,
})
export class RejillaComponent {
  readonly minimo = input<string | null>(null);
}
