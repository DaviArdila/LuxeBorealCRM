import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type TonoDeTarjeta = 'neutro' | 'primario' | 'secundario' | 'terciario';

/**
 * Tarjeta redondeada de un elemento de una lista (un caso, una sección, una categoría). El título va en su propia
 * fila con la fuente de títulos; debajo, la vista previa recortada y, al pie, las etiquetas y la ranura
 * `[acciones]` (íconos), que nunca le quitan ancho al título. `tono` pinta un acento a la izquierda según el tipo
 * (por ejemplo, sistema, guía o literal). La ranura `[esquina]` pone un control (un interruptor) arriba a la
 * derecha, junto al título. Con `clicable` el título es un botón real que cubre toda la tarjeta
 * (teclado y lector de pantalla sin trabajo extra) y emite `abrir`; las acciones quedan por encima. La variante
 * `categoria` muestra el conteo y los primeros títulos. `atenuada` marca un elemento inactivo.
 */
@Component({
  selector: 'app-tarjeta-elemento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.atenuada]': 'atenuada()',
    '[class.clicable]': 'clicable()',
    '[attr.data-variante]': 'variante()',
    '[attr.data-tono]': 'tono()',
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
      <span class="esquina"><ng-content select="[esquina]" /></span>
    </div>
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
    <div class="pie">
      @if (etiquetas().length > 0) {
        <div class="etiquetas" role="list" aria-label="Etiquetas">
          @for (etiqueta of etiquetas(); track etiqueta) {
            <span class="etiqueta" role="listitem" data-etiqueta>{{ etiqueta }}</span>
          }
        </div>
      }
      <span class="acciones"><ng-content select="[acciones]" /></span>
    </div>
  `,
  styles: `
    :host {
      --acento: var(--mat-sys-outline-variant);
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-s, 0.5rem);
      padding: var(--luxe-espacio-m, 1rem) var(--luxe-espacio-m, 1rem) var(--luxe-espacio-s, 0.5rem) 1.25rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--luxe-radio-tarjeta, 1rem);
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      /* El acento es una sombra interior: sigue el radio y no ocupa espacio. */
      box-shadow: inset 4px 0 0 var(--acento);
      transition: box-shadow 150ms ease, background 150ms ease;
    }
    :host([data-tono='primario']) {
      --acento: var(--mat-sys-primary);
    }
    :host([data-tono='secundario']) {
      --acento: var(--mat-sys-secondary);
    }
    :host([data-tono='terciario']) {
      --acento: var(--mat-sys-tertiary);
    }
    :host(.clicable:hover) {
      background: var(--mat-sys-surface-container-low);
      box-shadow: inset 4px 0 0 var(--acento), var(--mat-sys-level2);
    }
    :host(.atenuada) {
      --acento: var(--mat-sys-outline-variant);
      opacity: 0.65;
    }
    /* Anillo de foco interior: no se recorta dentro de una ventana con desplazamiento. */
    :host(:focus-within) {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -2px;
    }
    .cabecera {
      display: flex;
      align-items: flex-start;
      gap: var(--luxe-espacio-s, 0.5rem);
    }
    .titulo {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-family: var(--luxe-fuente-titulo);
      font-size: var(--luxe-titulo-tarjeta-tamano, 1.05rem);
      font-weight: 650;
      line-height: 1.3;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }
    .abrir {
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      letter-spacing: inherit;
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
      flex: none;
      min-width: 1.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font: var(--mat-sys-label-medium);
      text-align: center;
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
    .titulos li {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .pie {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--luxe-espacio-xs, 0.25rem) var(--luxe-espacio-s, 0.5rem);
      margin-top: auto;
      min-height: 2rem;
    }
    .etiquetas {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .etiqueta {
      padding: 0.0625rem 0.5rem;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-small);
    }
    .esquina {
      position: relative;
      z-index: 1;
      display: flex;
      flex: none;
      align-items: center;
    }
    .esquina:empty {
      display: none;
    }
    .acciones {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 0.125rem;
      margin-inline-start: auto;
    }
  `,
})
export class TarjetaElementoComponent {
  readonly titulo = input.required<string>();
  readonly etiquetas = input<readonly string[]>([]);
  /** Vista previa recortada a unas líneas; el texto completo se ve al abrir. */
  readonly vista = input<string | null>(null);
  readonly clicable = input(false);
  /** Elemento inactivo: se ve atenuado y pierde el acento. */
  readonly atenuada = input(false);
  /** Acento de la izquierda según el tipo del elemento. */
  readonly tono = input<TonoDeTarjeta>('neutro');
  readonly variante = input<'elemento' | 'categoria'>('elemento');
  /** Variante `categoria`: cuántos elementos contiene. */
  readonly conteo = input<number | null>(null);
  /** Variante `categoria`: los primeros títulos que contiene. */
  readonly titulos = input<readonly string[]>([]);
  readonly abrir = output<void>();
}
