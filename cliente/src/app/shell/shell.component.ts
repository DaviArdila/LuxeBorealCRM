import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import type { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { MessageModule } from 'primeng/message';
import { ToolbarModule } from 'primeng/toolbar';
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
  imports: [ButtonModule, MenuModule, MessageModule, RouterLink, RouterOutlet, ToolbarModule],
  template: `
    <p-toolbar class="barra">
      <ng-template #start>
        <a routerLink="/" class="marca"><i class="pi pi-sparkles" aria-hidden="true"></i> LuxeBoreal</a>
      </ng-template>
      <ng-template #end>
        <div class="sesion">
          <span class="usuario"><i class="pi pi-user" aria-hidden="true"></i> {{ sesion.usuario()?.nombre }}</span>
          <p-button label="Cerrar sesión" icon="pi pi-sign-out" severity="secondary" [text]="true"
                    data-accion="cerrar-sesion" (onClick)="cerrarSesion()" />
        </div>
      </ng-template>
    </p-toolbar>
    <div class="marco">
      <nav class="menu" aria-label="Menú principal">
        <p-menu [model]="menu()">
          <ng-template #submenuheader let-grupo>
            <span class="grupo"><i [class]="grupo.icon" aria-hidden="true"></i> {{ grupo.label }}</span>
          </ng-template>
        </p-menu>
      </nav>
      <main class="contenido">
        @if (avisos.permisoInsuficiente()) {
          <p-message severity="warn" closable (onClose)="avisos.descartarPermisoInsuficiente()">
            No tienes permiso para hacer eso. Si lo necesitas, pídeselo a un administrador.
          </p-message>
        }
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    .barra {
      display: block;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .marca {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--p-primary-color);
      text-decoration: none;
    }
    .sesion {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .usuario {
      color: var(--p-text-muted-color);
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
    }
    .grupo {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
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

  /** El menú de PrimeNG: un grupo por área visible y una entrada por pantalla, enlazadas con el router. */
  protected readonly menu = computed<MenuItem[]>(() =>
    this.areasVisibles().map((area) => ({
      label: area.titulo,
      icon: area.icono,
      items: area.menu.map((entrada) => ({ label: entrada.titulo, routerLink: entrada.ruta })),
    })),
  );

  async cerrarSesion(): Promise<void> {
    try {
      await this.sesion.cerrar();
    } finally {
      await this.router.navigateByUrl('/entrar');
    }
  }
}
