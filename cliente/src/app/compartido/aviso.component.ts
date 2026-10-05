import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

export type TipoDeAviso = 'error' | 'advertencia' | 'info';

const ICONOS: Record<TipoDeAviso, string> = { error: 'error', advertencia: 'warning', info: 'info' };

/**
 * Mensaje en línea (Angular Material no trae uno): error, advertencia o información, con la opción de
 * descartarlo. Los errores y las advertencias se anuncian de inmediato (`role="alert"`); la información,
 * sin interrumpir (`role="status"`).
 */
@Component({
  selector: 'app-aviso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatIconButton],
  host: {
    class: 'aviso',
    '[class]': 'tipo()',
    '[attr.role]': "tipo() === 'info' ? 'status' : 'alert'",
  },
  template: `
    <mat-icon [fontIcon]="icono()" aria-hidden="true" />
    <div class="contenido"><ng-content /></div>
    @if (descartable()) {
      <button mat-icon-button type="button" aria-label="Cerrar aviso" (click)="descartar.emit()">
        <mat-icon fontIcon="close" aria-hidden="true" />
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: var(--mat-sys-corner-medium);
      font: var(--mat-sys-body-medium);
    }
    :host(.error) {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    :host(.advertencia) {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    :host(.info) {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .contenido {
      flex: 1;
    }
  `,
})
export class AvisoComponent {
  readonly tipo = input.required<TipoDeAviso>();
  readonly descartable = input(false);
  readonly descartar = output<void>();

  protected readonly icono = computed(() => ICONOS[this.tipo()]);
}
