import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIcon } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { AREAS_REGISTRADAS } from '../nucleo/areas.token';
import type { Rol } from '../nucleo/definicion-area';
import { SesionServicio } from '../nucleo/sesion.servicio';

interface Pantalla {
  readonly titulo: string;
  readonly ruta: string;
  readonly icono: string;
}

interface Nodo {
  readonly titulo: string;
  readonly icono: string;
  /** Presente solo en un grupo; una entrada directa lleva `ruta`. */
  readonly hijos?: readonly Pantalla[];
  readonly ruta?: string;
}

/**
 * Menú lateral (SHL1-SHL7): árbol de áreas y grupos filtrado por el rol de `/yo`, con el grupo de la ruta activa
 * desplegado y un pie con el usuario. En un escritorio es un riel fijo de solo íconos que se expande por encima
 * del contenido con el mouse o el foco (sin empujarlo); plegado muestra solo íconos y nunca desborda a lo ancho. En un
 * teléfono es el contenido del cajón. No conoce ninguna área: todo sale del registro.
 * El servidor decide el acceso de verdad (API7); aquí solo se oculta lo que el rol no puede usar.
 */
@Component({
  selector: 'app-menu-lateral',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, NgTemplateOutlet, RouterLink, RouterLinkActive],
  host: {
    '[class.riel]': '!telefono()',
    '[class.expandido]': '!telefono() && expandido()',
    '[attr.data-riel]': "telefono() ? null : expandido() ? 'expandido' : 'plegado'",
    '(mouseenter)': 'expandido.set(true)',
    '(mouseleave)': 'expandido.set(false)',
    '(focusin)': 'expandido.set(true)',
    '(focusout)': 'alPerderFoco($event)',
  },
  template: `
    @if (!telefono()) {
      <a class="marca" routerLink="/" aria-label="LuxeBoreal, inicio">
        <mat-icon class="icono" fontIcon="auto_awesome" aria-hidden="true" />
        <span class="titulo">LuxeBoreal</span>
      </a>
    }
    <nav class="menu" aria-label="Menú principal">
      <ul class="lista">
        @for (nodo of nodos(); track nodo.titulo) {
          <li>
            @if (nodo.hijos; as hijos) {
              <button type="button" class="item" [attr.data-grupo]="nodo.titulo" [attr.aria-expanded]="estaAbierto(nodo)"
                [attr.aria-label]="nodo.titulo" (click)="alternar(nodo)">
                <mat-icon class="icono" [fontIcon]="nodo.icono" aria-hidden="true" />
                <span class="titulo">{{ nodo.titulo }}</span>
                <mat-icon class="flecha" fontIcon="expand_more" aria-hidden="true" />
              </button>
              @if (estaAbierto(nodo)) {
                <ul class="lista hijos">
                  @for (hijo of hijos; track hijo.ruta) {
                    <li><ng-container *ngTemplateOutlet="enlace; context: { $implicit: hijo }" /></li>
                  }
                </ul>
              }
            } @else {
              <ng-container *ngTemplateOutlet="enlace; context: { $implicit: nodo }" />
            }
          </li>
        }
      </ul>
    </nav>

    <ng-template #enlace let-pantalla>
      <a class="item" [routerLink]="pantalla.ruta" routerLinkActive="activa" #activa="routerLinkActive"
        [attr.data-entrada]="pantalla.ruta" [attr.aria-current]="activa.isActive ? 'page' : null"
        [attr.aria-label]="pantalla.titulo" (click)="navegar.emit()">
        <mat-icon class="icono" [fontIcon]="pantalla.icono" aria-hidden="true" />
        <span class="titulo">{{ pantalla.titulo }}</span>
      </a>
    </ng-template>

    <div class="pie" data-pie>
      <p class="persona">
        <span class="nombre">{{ sesion.usuario()?.nombre }}</span>
        <span class="rol">{{ sesion.usuario()?.rol }}</span>
      </p>
      <button type="button" class="item" data-accion="cerrar-sesion" aria-label="Cerrar sesión" (click)="cerrarSesion()">
        <mat-icon class="icono" fontIcon="logout" aria-hidden="true" />
        <span class="titulo">Cerrar sesión</span>
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 0.75rem 0.5rem;
      box-sizing: border-box;
    }
    /*
     * Riel: fijo al borde izquierdo con el ancho del riel; expandido (mouse o foco) crece por encima del contenido.
     * Nada desborda a lo ancho: los íconos no se encogen (flex: none) y los textos se recortan sin saltar de línea.
     */
    :host(.riel) {
      position: fixed;
      inset-block: 0;
      inset-inline-start: 0;
      z-index: 5;
      width: var(--luxe-riel-ancho);
      overflow: hidden;
      border-right: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface);
      transition: width 150ms ease, box-shadow 150ms ease;
    }
    :host(.riel.expandido) {
      width: var(--luxe-menu-ancho);
      box-shadow: var(--mat-sys-level3);
    }
    :host(.riel) .titulo,
    :host(.riel) .flecha,
    :host(.riel) .persona {
      transition: opacity 100ms ease;
    }
    :host(.riel:not(.expandido)) .titulo,
    :host(.riel:not(.expandido)) .flecha,
    :host(.riel:not(.expandido)) .persona {
      opacity: 0;
    }
    :host(.riel:not(.expandido)) .hijos {
      display: none;
    }
    .icono {
      flex: none;
    }
    .marca {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 3.5rem;
      padding: 0 1rem;
      margin-bottom: 0.5rem;
      border-radius: var(--mat-sys-corner-full);
      font-family: var(--luxe-fuente-titulo, inherit);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--mat-sys-primary);
      text-decoration: none;
      white-space: nowrap;
    }
    .marca:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -2px;
    }
    .menu {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .lista {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .hijos {
      margin: 0.25rem 0 0.25rem 1.75rem;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      min-height: 2.75rem;
      padding: 0 1rem;
      box-sizing: border-box;
      border: 0;
      border-radius: var(--mat-sys-corner-full);
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }
    .item:hover {
      background: var(--mat-sys-surface-container-high);
    }
    .item:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -2px;
    }
    .item.activa {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .titulo {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .flecha {
      flex: none;
      transition: transform 150ms;
    }
    [aria-expanded='true'] .flecha {
      transform: rotate(180deg);
    }
    .pie {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .persona {
      display: flex;
      flex-direction: column;
      margin: 0 1rem 0.5rem;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
      white-space: nowrap;
      overflow: hidden;
    }
    .rol {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class MenuLateralComponent {
  readonly telefono = input(false);
  /** El usuario eligió una pantalla: el marco cierra el cajón en un teléfono. */
  readonly navegar = output<void>();

  protected readonly sesion = inject(SesionServicio);
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly areas = inject(AREAS_REGISTRADAS);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
      map((evento) => evento.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** Riel expandido: el mouse está encima o el foco está adentro (el CSS lee la clase `expandido`). */
  protected readonly expandido = signal(false);
  /** Lo que el usuario abrió o cerró a mano; sin decisión, un grupo se abre si contiene la ruta activa (SHL2). */
  private readonly decididos = signal<ReadonlyMap<string, boolean>>(new Map());

  /** Solo las áreas, grupos y pantallas que el rol puede usar; un grupo sin hijos visibles no se muestra (SHL3). */
  protected readonly nodos = computed<readonly Nodo[]>(() => {
    const rol = this.sesion.usuario()?.rol;
    if (rol === undefined) return [];
    return this.areas
      .filter((area) => area.roles.includes(rol))
      .flatMap((area) =>
        area.menu.flatMap((entrada): readonly Nodo[] => {
          if (!entrada.roles.includes(rol)) return [];
          if (entrada.hijos === undefined) {
            return [{ titulo: entrada.titulo, icono: entrada.icono ?? area.icono, ruta: entrada.ruta }];
          }
          const hijos = permitidos(entrada.hijos, rol, entrada.icono);
          return hijos.length > 0 ? [{ titulo: entrada.titulo, icono: entrada.icono, hijos }] : [];
        }),
      );
  });

  /** El foco salió del menú (no solo pasó a otra entrada): el riel se pliega. */
  protected alPerderFoco(evento: FocusEvent): void {
    const destino = evento.relatedTarget;
    if (!(destino instanceof Node) || !this.anfitrion.nativeElement.contains(destino)) this.expandido.set(false);
  }

  protected estaAbierto(nodo: Nodo): boolean {
    return this.decididos().get(nodo.titulo) ?? this.contieneLaRutaActiva(nodo);
  }

  protected alternar(nodo: Nodo): void {
    const abierto = !this.estaAbierto(nodo);
    this.decididos.update((previas) => new Map(previas).set(nodo.titulo, abierto));
  }

  protected async cerrarSesion(): Promise<void> {
    try {
      await this.sesion.cerrar();
    } finally {
      await this.router.navigateByUrl('/entrar');
    }
  }

  private contieneLaRutaActiva(nodo: Nodo): boolean {
    const actual = this.url();
    return (nodo.hijos ?? []).some((hijo) => actual === hijo.ruta || actual.startsWith(`${hijo.ruta}/`));
  }
}

function permitidos(
  hijos: readonly { titulo: string; ruta: string; roles: readonly Rol[]; icono?: string }[],
  rol: Rol,
  iconoDelGrupo: string,
): readonly Pantalla[] {
  return hijos
    .filter((hijo) => hijo.roles.includes(rol))
    .map((hijo) => ({ titulo: hijo.titulo, ruta: hijo.ruta, icono: hijo.icono ?? iconoDelGrupo }));
}
