import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatListItem, MatListItemTitle, MatListSubheaderCssMatStyler, MatNavList } from '@angular/material/list';
import { MatToolbar } from '@angular/material/toolbar';
import { AvisoComponent } from '../compartido/aviso.component';
import { AREAS_REGISTRADAS } from '../nucleo/areas.token';
import { AvisosServicio } from '../nucleo/avisos.servicio';
import { SesionServicio } from '../nucleo/sesion.servicio';

/**
 * Marco de la app: barra con el usuario y «Cerrar sesión», menú armado con las áreas del registro
 * que el rol puede usar (CLT9) y el aviso de permiso insuficiente (CLT5). No conoce ninguna área.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    MatButton,
    MatIcon,
    MatListItem,
    MatListItemTitle,
    MatListSubheaderCssMatStyler,
    MatNavList,
    MatToolbar,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  template: `
    <mat-toolbar class="barra">
      <a routerLink="/" class="marca"><mat-icon fontIcon="auto_awesome" aria-hidden="true" /> LuxeBoreal</a>
      <span class="espacio"></span>
      <span class="usuario"><mat-icon fontIcon="person" aria-hidden="true" /> {{ sesion.usuario()?.nombre }}</span>
      <button mat-button type="button" data-accion="cerrar-sesion" (click)="cerrarSesion()">
        <mat-icon fontIcon="logout" aria-hidden="true" />Cerrar sesión
      </button>
    </mat-toolbar>
    <div class="marco">
      <nav class="menu" aria-label="Menú principal">
        @for (area of areasVisibles(); track area.id) {
          <mat-nav-list [attr.aria-labelledby]="'menu-' + area.id">
            <h2 matSubheader class="grupo" [id]="'menu-' + area.id">
              <mat-icon [fontIcon]="area.icono" aria-hidden="true" /> {{ area.titulo }}
            </h2>
            @for (entrada of area.menu; track entrada.ruta) {
              <a mat-list-item [routerLink]="entrada.ruta" routerLinkActive #activa="routerLinkActive"
                 [activated]="activa.isActive" [attr.aria-current]="activa.isActive ? 'page' : null">
                <span matListItemTitle>{{ entrada.titulo }}</span>
              </a>
            }
          </mat-nav-list>
        }
      </nav>
      <main class="contenido">
        @if (avisos.permisoInsuficiente()) {
          <app-aviso tipo="advertencia" [descartable]="true" (descartar)="avisos.descartarPermisoInsuficiente()">
            No tienes permiso para hacer eso. Si lo necesitas, pídeselo a un administrador.
          </app-aviso>
        }
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    .barra {
      position: sticky;
      top: 0;
      z-index: 1;
      gap: 0.75rem;
      background: var(--mat-sys-surface-container);
    }
    .marca {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--mat-sys-primary);
      text-decoration: none;
    }
    .espacio {
      flex: 1;
    }
    .usuario {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .marco {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 1.5rem;
      max-width: 80rem;
      margin: 0 auto;
      padding: 1.5rem 1rem;
    }
    .menu {
      flex: 0 0 15rem;
      border-radius: var(--mat-sys-corner-large);
      background: var(--mat-sys-surface);
    }
    .grupo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }
    .contenido {
      flex: 1 1 32rem;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    @media (max-width: 640px) {
      .menu {
        flex-basis: 100%;
      }
      .usuario {
        display: none;
      }
    }
  `,
})
export class ShellComponent {
  protected readonly sesion = inject(SesionServicio);
  protected readonly avisos = inject(AvisosServicio);
  private readonly router = inject(Router);
  private readonly areas = inject(AREAS_REGISTRADAS);

  /** Solo las áreas y entradas que el rol de `/yo` puede usar; el servidor protege cada llamada igual. */
  protected readonly areasVisibles = computed(() => {
    const rol = this.sesion.usuario()?.rol;
    if (rol === undefined) return [];
    return this.areas
      .filter((area) => area.roles.includes(rol))
      .map((area) => ({ ...area, menu: area.menu.filter((entrada) => entrada.roles.includes(rol)) }))
      .filter((area) => area.menu.length > 0);
  });

  async cerrarSesion(): Promise<void> {
    try {
      await this.sesion.cerrar();
    } finally {
      await this.router.navigateByUrl('/entrar');
    }
  }
}
