import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

export type TipoDeAviso = 'error' | 'advertencia' | 'info';

const ICONOS: Record<TipoDeAviso, string> = { error: 'error', advertencia: 'warning', info: 'info' };

/**
 * Mensaje (Angular Material no trae uno): error, advertencia o información, con la opción de descartarlo. Los
 * errores y las advertencias se anuncian de inmediato (`role="alert"`); la información, sin interrumpir
 * (`role="status"`).
 *
 * Con `flotante` va dentro de `app-cabecera-pagina`: aparece unos segundos como mensaje breve bajo la cabecera y
 * luego se pliega (clase `plegado`) dentro del botón «Ayuda y avisos», donde sigue listado. Nunca se descarta solo:
 * un error queda ahí hasta que alguien lo cierre. Sin `flotante` es un aviso en línea de siempre.
 */
@Component({
  selector: 'app-aviso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatIconButton],
  host: {
    class: 'aviso',
    '[class]': 'tipo()',
    '[class.flotante]': 'flotante()',
    '[class.plegado]': 'flotante() && plegado()',
    '[class.oculto]': 'flotante() && plegado() && !enPanel()',
    '[class.en-panel]': 'flotante() && enPanel()',
    '[attr.role]': "tipo() === 'info' ? 'status' : 'alert'",
  },
  template: `
    <mat-icon class="icono" [fontIcon]="icono()" aria-hidden="true" />
    <div class="contenido"><ng-content /></div>
    @if (descartable()) {
      <button mat-icon-button type="button" class="cerrar" aria-label="Cerrar aviso" (click)="descartar.emit()">
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
    /* Flotante: mensaje breve con sombra; plegado se oculta salvo con el panel de la cabecera abierto. */
    :host(.flotante) {
      padding: 0.5rem 0.25rem 0.5rem 0.75rem;
      box-shadow: var(--mat-sys-level2);
      animation: aparecer 150ms ease;
    }
    :host(.oculto) {
      display: none;
    }
    :host(.en-panel) {
      box-shadow: none;
      animation: none;
    }
    .icono {
      flex: none;
    }
    .contenido {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .cerrar {
      flex: none;
    }
    @keyframes aparecer {
      from {
        opacity: 0;
        transform: translateY(-0.25rem);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host(.flotante) {
        animation: none;
      }
    }
  `,
})
export class AvisoComponent {
  readonly tipo = input.required<TipoDeAviso>();
  readonly descartable = input(false);
  /** Modo flotante: mensaje breve que se pliega en el botón «Ayuda y avisos» de la cabecera tras `segundos`. */
  readonly flotante = input(false);
  /** Segundos que el aviso flotante queda a la vista antes de plegarse. */
  readonly segundos = input(6);
  readonly descartar = output<void>();

  protected readonly icono = computed(() => ICONOS[this.tipo()]);
  readonly plegado = signal(false);
  /** Lo fija la cabecera: con su panel abierto se listan todos los avisos, también los plegados. */
  readonly enPanel = signal(false);
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (!this.flotante()) return;
      const segundos = this.segundos();
      untracked(() => this.programar(segundos));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.temporizador));
  }

  /** Muestra el aviso y agenda su pliegue. */
  private programar(segundos: number): void {
    clearTimeout(this.temporizador);
    this.plegado.set(false);
    this.temporizador = setTimeout(() => this.plegado.set(true), segundos * 1000);
  }
}
