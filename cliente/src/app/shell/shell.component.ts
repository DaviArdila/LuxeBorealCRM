import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
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
/** Preferencia local del modo compacto (SHL4): una conveniencia, nunca un dato que deba persistir. */
const CLAVE_COMPACTO = 'luxe.menu.compacto';

function leerCompacto(): boolean {
  try {
    return localStorage.getItem(CLAVE_COMPACTO) === '1';
  } catch {
    return false;
  }
}

function guardarCompacto(compacto: boolean): void {
  try {
    localStorage.setItem(CLAVE_COMPACTO, compacto ? '1' : '0');
  } catch {
    // Almacenamiento bloqueado: el menú cambia de modo igual, solo que no se recuerda.
  }
}

/**
 * Marco de la app: barra superior, menú lateral armado desde el registro de áreas (CLT9, SHL1) y el aviso de
 * permiso insuficiente (CLT5). En un teléfono el menú es un cajón. No conoce ninguna área.
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
    <mat-toolbar class="barra">
      @if (telefono()) {
        <button mat-icon-button type="button" data-accion="abrir-menu" aria-label="Abrir o cerrar el menú"
          [attr.aria-expanded]="abierto()" (click)="abierto.set(!abierto())">
          <mat-icon fontIcon="menu" aria-hidden="true" />
        </button>
      }
      <a routerLink="/" class="marca"><mat-icon fontIcon="auto_awesome" aria-hidden="true" /> LuxeBoreal</a>
    </mat-toolbar>
    <mat-sidenav-container class="marco">
      <mat-sidenav [mode]="telefono() ? 'over' : 'side'" [opened]="abierto()" (closedStart)="abierto.set(false)"
        [class.compacta]="compacto() && !telefono()" class="lateral">
        <app-menu-lateral [compacto]="compacto() && !telefono()" [telefono]="telefono()"
          (alternarCompacto)="alternarCompacto()" (navegar)="alNavegar()" />
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
    .lateral {
      width: 16rem;
      border-right: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface);
    }
    .lateral.compacta {
      width: 4.5rem;
    }
    .pagina {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 64rem;
      margin: 0 auto;
      padding: 1.5rem 1rem;
      box-sizing: border-box;
    }
  `,
})
export class ShellComponent {
  protected readonly avisos = inject(AvisosServicio);
  protected readonly compacto = signal(leerCompacto());
  protected readonly telefono = toSignal(
    inject(BreakpointObserver)
      .observe(CONSULTA_TELEFONO)
      .pipe(map((estado) => estado.matches)),
    { initialValue: false },
  );
  /** Cajón abierto: en un escritorio el panel arranca abierto y en un teléfono, cerrado. */
  protected readonly abierto = linkedSignal(() => !this.telefono());

  protected alternarCompacto(): void {
    const siguiente = !this.compacto();
    this.compacto.set(siguiente);
    guardarCompacto(siguiente);
  }

  protected alNavegar(): void {
    if (this.telefono()) this.abierto.set(false);
  }
}
