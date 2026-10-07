import { ChangeDetectionStrategy, Component, computed, contentChildren, effect, ElementRef, inject, input, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { AvisoComponent, type TipoDeAviso } from './aviso.component';

const GRAVEDAD: Record<TipoDeAviso, number> = { info: 0, advertencia: 1, error: 2 };
let siguienteId = 0;

/**
 * Cabecera de página: título del módulo (`<h1>` con la fuente de títulos), una ranura para las acciones de la
 * pantalla y, al final de ellas, un solo botón «Ayuda y avisos». Ese botón abre un panel con el texto de ayuda y
 * la lista de avisos; con avisos lleva una insignia con cuántos hay y el tono del más grave.
 *
 * Los `app-aviso` proyectados (con `flotante`) aparecen unos segundos bajo la cabecera, a la derecha, y luego se
 * pliegan dentro del botón: con el panel abierto se ven todos. El componente no conoce ninguna pantalla.
 */
@Component({
  selector: 'app-cabecera-pagina',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatIconButton, MatTooltip],
  host: {
    '(document:keydown.escape)': 'abierta.set(false)',
    '(document:click)': 'alClicEnDocumento($event)',
  },
  template: `
    <div class="titulo"><h1>{{ titulo() }}</h1></div>
    <div class="acciones luxe-compacto">
      <ng-content />
      @if (hayBoton()) {
        <span class="ancla">
          <button mat-icon-button type="button" data-accion="ayuda-avisos" matTooltip="Ayuda y avisos"
            [attr.aria-label]="etiqueta()" [attr.aria-expanded]="abierta()" [attr.aria-controls]="idPanel"
            [attr.data-tono]="tono()" (click)="abierta.set(!abierta())">
            <mat-icon fontIcon="info" aria-hidden="true" />
          </button>
          @if (avisos().length > 0) {
            <span class="insignia" data-insignia aria-hidden="true">{{ avisos().length }}</span>
          }
        </span>
      }
    </div>
    <div class="zona" data-zona-avisos [id]="idPanel" [class.abierta]="abierta()">
      @if (abierta()) {
        @if (ayuda(); as texto) {
          <p class="ayuda" data-ayuda>{{ texto }}</p>
        }
        @if (avisos().length === 0) {
          <p class="sin-avisos">No hay avisos.</p>
        }
      }
      <ng-content select="app-aviso" />
    </div>
  `,
  styles: `
    :host {
      position: relative;
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
      font-family: var(--luxe-fuente-titulo);
      font-size: var(--luxe-titulo-pagina-tamano);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: var(--mat-sys-on-surface);
    }
    .ancla {
      position: relative;
      display: inline-flex;
    }
    [data-tono='info'] {
      color: var(--mat-sys-primary);
    }
    [data-tono='advertencia'] {
      color: var(--mat-sys-tertiary);
    }
    [data-tono='error'] {
      color: var(--mat-sys-error);
    }
    .insignia {
      position: absolute;
      top: 0;
      right: 0;
      min-width: 1.1rem;
      height: 1.1rem;
      padding: 0 0.25rem;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font: var(--mat-sys-label-small);
      line-height: 1.1rem;
      text-align: center;
      pointer-events: none;
    }
    [data-tono='advertencia'] + .insignia {
      background: var(--mat-sys-tertiary);
      color: var(--mat-sys-on-tertiary);
    }
    [data-tono='error'] + .insignia {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
    /* Zona de avisos: mensajes breves arriba a la derecha del contenido; abierta es el panel de ayuda y avisos. */
    .zona {
      position: absolute;
      top: calc(100% + var(--luxe-espacio-s, 0.5rem));
      right: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-s, 0.5rem);
      width: min(26rem, 100%);
    }
    .zona.abierta {
      max-height: min(70vh, 32rem);
      overflow-y: auto;
      padding: var(--luxe-espacio-m, 1rem);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--luxe-radio-tarjeta, 1rem);
      background: var(--mat-sys-surface-container);
      box-shadow: var(--mat-sys-level3);
    }
    .ayuda,
    .sin-avisos {
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
      white-space: pre-line;
    }
    .sin-avisos {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CabeceraPaginaComponent {
  readonly titulo = input.required<string>();
  /** Texto explicativo de la pantalla; se lee en el panel del botón «Ayuda y avisos». */
  readonly ayuda = input<string | null>(null);

  protected readonly avisos = contentChildren(AvisoComponent, { descendants: true });
  protected readonly abierta = signal(false);
  protected readonly idPanel = `luxe-ayuda-avisos-${siguienteId++}`;
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly hayBoton = computed(() => this.ayuda() !== null || this.avisos().length > 0);
  /** El tipo del aviso más grave, o nada si no hay avisos. */
  protected readonly tono = computed<TipoDeAviso | null>(() =>
    this.avisos().reduce<TipoDeAviso | null>(
      (peor, aviso) => (peor === null || GRAVEDAD[aviso.tipo()] > GRAVEDAD[peor] ? aviso.tipo() : peor),
      null,
    ),
  );
  protected readonly etiqueta = computed(() => {
    const cuantos = this.avisos().length;
    return cuantos === 0 ? 'Ayuda y avisos' : `Ayuda y avisos (${cuantos} ${cuantos === 1 ? 'aviso' : 'avisos'})`;
  });

  constructor() {
    effect(() => {
      const abierta = this.abierta();
      for (const aviso of this.avisos()) aviso.enPanel.set(abierta);
    });
  }

  /** Un clic fuera de la cabecera cierra el panel. */
  protected alClicEnDocumento(evento: Event): void {
    if (!this.abierta()) return;
    const destino = evento.target;
    if (destino instanceof Node && !this.anfitrion.nativeElement.contains(destino)) this.abierta.set(false);
  }
}
