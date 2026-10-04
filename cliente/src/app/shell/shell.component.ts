import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
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
  imports: [ButtonModule, MessageModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="barra">
      <a routerLink="/" class="marca">LuxeBoreal</a>
      <span class="usuario">{{ sesion.usuario()?.nombre }}</span>
      <p-button label="Cerrar sesión" severity="secondary" data-accion="cerrar-sesion" (onClick)="cerrarSesion()" />
    </header>
    <div class="marco">
      <nav class="menu" aria-label="Menú principal">
        @for (area of areasVisibles(); track area.id) {
          <section>
            <h2><i [class]="area.icono"></i> {{ area.titulo }}</h2>
            <ul>
              @for (entrada of area.menu; track entrada.ruta) {
                <li><a [routerLink]="entrada.ruta" routerLinkActive="activa">{{ entrada.titulo }}</a></li>
              }
            </ul>
          </section>
        }
      </nav>
      <main>
        @if (avisos.permisoInsuficiente()) {
          <p-message severity="warn" closable (onClose)="avisos.descartarPermisoInsuficiente()">
            No tienes permiso para hacer eso. Si lo necesitas, pídeselo a un administrador.
          </p-message>
        }
        <router-outlet />
      </main>
    </div>
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
