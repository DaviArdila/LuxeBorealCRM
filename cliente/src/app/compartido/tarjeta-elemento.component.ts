import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Tarjeta redondeada de un elemento de una lista (un caso, una sección, una categoría): título, etiquetas de
 * estado, vista previa recortada y una ranura `[acciones]`. Con `clicable` el título es un botón real que cubre
 * toda la tarjeta (teclado y lector de pantalla sin trabajo extra) y emite `abrir`; las acciones quedan por encima.
 * La variante `categoria` muestra el conteo y los primeros títulos. `atenuada` marca un elemento inactivo.
 */
@Component({
  selector: 'app-tarjeta-elemento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.atenuada]': 'atenuada()',
    '[class.clicable]': 'clicable()',
    '[attr.data-variante]': 'variante()',
  },
  template: `
    <div class="cabecera">
      <h3 class="titulo">
        @if (clicable()) {
          <button type="button" class="abrir" data-accion="abrir" (click)="abrir.emit()">{{ titulo() }}</button>
        } @else {
          {{ titulo() }}
        }
      </h3>
      @if (conteo() !== null) {
        <span class="conteo" data-conteo>{{ conteo() }}</span>
      }
      <span class="acciones"><ng-content select="[acciones]" /></span>
    </div>
    @if (etiquetas().length > 0) {
      <div class="etiquetas" role="list" aria-label="Etiquetas">
        @for (etiqueta of etiquetas(); track etiqueta) {
          <span class="etiqueta" role="listitem" data-etiqueta>{{ etiqueta }}</span>
        }
      </div>
    }
    @if (variante() === 'categoria') {
      <ul class="titulos" data-titulos>
        @for (texto of titulos(); track texto) {
          <li>{{ texto }}</li>
        }
      </ul>
    } @else if (vista(); as texto) {
      <p class="vista" data-vista>{{ texto }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-s, 0.5rem);
      padding: var(--luxe-espacio-m, 1rem);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--luxe-radio-tarjeta, 1rem);
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      transition: box-shadow 150ms ease, background 150ms ease;
    }
    :host(.clicable:hover) {
      background: var(--mat-sys-surface-container-low);
      box-shadow: var(--mat-sys-level1);
    }
    :host(.atenuada) {
      opacity: 0.6;
    }
    :host(:focus-within) {
      outline: 2px solid var(--mat-sys-primary);
    }
    .cabecera {
      display: flex;
      align-items: flex-start;
      gap: var(--luxe-espacio-s, 0.5rem);
    }
    .titulo {
      flex: 1;
      margin: 0;
      font: var(--mat-sys-title-medium);
      overflow-wrap: anywhere;
    }
    .abrir {
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .abrir::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
    }
    .abrir:focus-visible {
      outline: none;
    }
    .conteo {
      padding: 0 0.5rem;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font: var(--mat-sys-label-medium);
    }
    .acciones {
      position: relative;
      z-index: 1;
      display: flex;
      gap: 0.25rem;
    }
    .etiquetas {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .etiqueta {
      padding: 0 0.5rem;
      border-radius: var(--mat-sys-corner-full);
      border: 1px solid var(--mat-sys-outline-variant);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-small);
    }
    .vista,
    .titulos {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .vista {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .titulos {
      padding-inline-start: 1rem;
    }
  `,
})
export class TarjetaElementoComponent {
  readonly titulo = input.required<string>();
  readonly etiquetas = input<readonly string[]>([]);
  /** Vista previa recortada a unas líneas; el texto completo se ve al abrir. */
  readonly vista = input<string | null>(null);
  readonly clicable = input(false);
  /** Elemento inactivo: se ve atenuado. */
  readonly atenuada = input(false);
  readonly variante = input<'elemento' | 'categoria'>('elemento');
  /** Variante `categoria`: cuántos elementos contiene. */
  readonly conteo = input<number | null>(null);
  /** Variante `categoria`: los primeros títulos que contiene. */
  readonly titulos = input<readonly string[]>([]);
  readonly abrir = output<void>();
}
