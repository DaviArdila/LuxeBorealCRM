import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

export type TipoDeAviso = 'error' | 'advertencia' | 'info';

const ICONOS: Record<TipoDeAviso, string> = { error: 'error', advertencia: 'warning', info: 'info' };
const ETIQUETAS: Record<TipoDeAviso, string> = { error: 'error', advertencia: 'advertencia', info: 'información' };

/**
 * Mensaje (Angular Material no trae uno): error, advertencia o información, con la opción de descartarlo. Los
 * errores y las advertencias se anuncian de inmediato (`role="alert"`); la información, sin interrumpir
 * (`role="status"`).
 *
 * Con `flotante` se ancla a la esquina de la página: aparece unos segundos y se pliega a un ícono con insignia;
 * al pulsarlo se vuelve a abrir. Nunca se descarta solo (un error no desaparece sin que alguien lo vea).
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
    '[style.--luxe-aviso-nivel]': 'flotante() ? nivel() : null',
    '[attr.role]': "tipo() === 'info' ? 'status' : 'alert'",
  },
  template: `
    @if (flotante() && plegado()) {
      <button type="button" class="icono" data-accion="mostrar-aviso" [attr.aria-label]="'Mostrar aviso de ' + etiqueta()"
        (click)="reabrir()">
        <mat-icon [fontIcon]="icono()" aria-hidden="true" />
        <span class="insignia" aria-hidden="true"></span>
      </button>
    } @else {
      <mat-icon [fontIcon]="icono()" aria-hidden="true" />
      <div class="contenido"><ng-content /></div>
      @if (descartable()) {
        <button mat-icon-button type="button" aria-label="Cerrar aviso" (click)="descartar.emit()">
          <mat-icon fontIcon="close" aria-hidden="true" />
        </button>
      }
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
    :host(.flotante) {
      position: fixed;
      inset-inline-end: var(--luxe-espacio-m, 1rem);
      inset-block-end: calc(var(--luxe-espacio-m, 1rem) + var(--luxe-aviso-nivel, 0) * 3.75rem);
      z-index: 20;
      max-width: min(26rem, calc(100vw - 2rem));
      box-shadow: var(--mat-sys-level3);
    }
    :host(.flotante.plegado) {
      padding: 0;
      border-radius: var(--mat-sys-corner-full);
    }
    .contenido {
      flex: 1;
    }
    .icono {
      position: relative;
      display: grid;
      place-items: center;
      width: 3rem;
      height: 3rem;
      padding: 0;
      border: 0;
      border-radius: inherit;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .icono:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    .insignia {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      width: 0.7rem;
      height: 0.7rem;
      border-radius: 50%;
      background: var(--mat-sys-error);
      border: 2px solid var(--mat-sys-surface);
    }
  `,
})
export class AvisoComponent {
  readonly tipo = input.required<TipoDeAviso>();
  readonly descartable = input(false);
  /** Modo flotante: anclado a la esquina, se pliega a un ícono tras `segundos`. */
  readonly flotante = input(false);
  /** Segundos que el aviso flotante queda abierto antes de plegarse. */
  readonly segundos = input(6);
  /** Posición apilada de varios avisos flotantes (0 abajo del todo, 1 encima, etc.). */
  readonly nivel = input(0);
  readonly descartar = output<void>();

  protected readonly icono = computed(() => ICONOS[this.tipo()]);
  protected readonly etiqueta = computed(() => ETIQUETAS[this.tipo()]);
  protected readonly plegado = signal(false);
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (!this.flotante()) return;
      const segundos = this.segundos();
      untracked(() => this.programar(segundos));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.temporizador));
  }

  protected reabrir(): void {
    this.programar(this.segundos());
  }

  /** Abre el aviso y agenda su pliegue; reabrir reinicia la cuenta. */
  private programar(segundos: number): void {
    clearTimeout(this.temporizador);
    this.plegado.set(false);
    this.temporizador = setTimeout(() => this.plegado.set(true), segundos * 1000);
  }
}
