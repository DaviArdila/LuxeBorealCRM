import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AvisoComponent } from '../compartido/aviso.component';
import { AvisosServicio } from '../nucleo/avisos.servicio';
import { MenuLateralComponent } from './menu-lateral.component';

/** Ancho a partir del cual el menú deja de ser un panel fijo y pasa a ser un cajón (SHL5). */
const CONSULTA_TELEFONO = '(max-width: 640px)';

/**
 * Marco de la app: menú lateral armado desde el registro de áreas (CLT9, SHL1) y el aviso de permiso
 * insuficiente (CLT5). En un escritorio el menú es un riel fijo de solo íconos que se expande por encima del
 * contenido al pasar el mouse o con el foco, y el logo vive en el menú (no hay barra superior). En un teléfono
 * el menú es un cajón con una barra mínima (hamburguesa y logo). No conoce ninguna área.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    MatIcon,
    MatIconButton,
    MatSidenav,
    MatSidenavContainer,
    MatSidenavContent,
    MatToolbar,
    MenuLateralComponent,
    RouterLink,
    RouterOutlet,
  ],
  template: `
    @if (telefono()) {
      <mat-toolbar class="barra">
        <button mat-icon-button type="button" data-accion="abrir-menu" aria-label="Abrir o cerrar el menú"
          [attr.aria-expanded]="abierto()" (click)="abierto.set(!abierto())">
          <mat-icon fontIcon="menu" aria-hidden="true" />
        </button>
        <a routerLink="/" class="marca"><mat-icon fontIcon="auto_awesome" aria-hidden="true" /> LuxeBoreal</a>
      </mat-toolbar>
    }
    <mat-sidenav-container class="marco">
      <mat-sidenav [mode]="telefono() ? 'over' : 'side'" [opened]="abierto()" (closedStart)="abierto.set(false)"
        [class.telefono]="telefono()" class="lateral">
        <app-menu-lateral [telefono]="telefono()" (navegar)="alNavegar()" />
      </mat-sidenav>
      <mat-sidenav-content class="contenido">
        <main class="pagina">
          @if (avisos.permisoInsuficiente()) {
            <app-aviso tipo="advertencia" [descartable]="true" (descartar)="avisos.descartarPermisoInsuficiente()">
              No tienes permiso para hacer eso. Si lo necesitas, pídeselo a un administrador.
            </app-aviso>
          }
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100dvh;
    }
    .barra {
      flex: none;
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
    .marco {
      flex: 1;
      min-height: 0;
      background: transparent;
    }
    /* Escritorio: el cajón solo reserva el ancho del riel; el menú se expande por encima (position: fixed). */
    .lateral {
      width: var(--luxe-riel-ancho);
      border-right: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface);
    }
    .lateral.telefono {
      width: var(--luxe-menu-ancho);
    }
    .pagina {
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-m);
      max-width: var(--luxe-pagina-ancho);
      margin: 0 auto;
      padding: var(--luxe-espacio-l) clamp(1rem, 3vw, 2rem);
      box-sizing: border-box;
    }
  `,
})
export class ShellComponent {
  protected readonly avisos = inject(AvisosServicio);
  protected readonly telefono = toSignal(
    inject(BreakpointObserver)
      .observe(CONSULTA_TELEFONO)
      .pipe(map((estado) => estado.matches)),
    { initialValue: false },
  );
  /** Cajón abierto: en un escritorio el panel arranca abierto y en un teléfono, cerrado. */
  protected readonly abierto = linkedSignal(() => !this.telefono());

  protected alNavegar(): void {
    if (this.telefono()) this.abierto.set(false);
  }
}
