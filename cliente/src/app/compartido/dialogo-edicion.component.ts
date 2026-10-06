import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  signal,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog, MatDialogActions, MatDialogContent, type MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { filter } from 'rxjs';
import { AvisoComponent } from './aviso.component';
import { ConfirmacionComponent } from './confirmacion.component';

/**
 * Ventana emergente de edición (SHL8): las pantallas muestran en modo lectura y «Editar» o «Nuevo»
 * abren este componente con el formulario proyectado. Se controla con `abierta` (two-way), como
 * `app-confirmacion`. Muestra los errores del servidor dentro, sin perder lo escrito; pide confirmación
 * al cerrar con cambios (Cancelar, Escape o clic fuera) y, si la pantalla lo pide, antes de guardar.
 * El foco entra al formulario y vuelve al botón que la abrió (lo hace `MatDialog`).
 */
@Component({
  selector: 'app-dialogo-edicion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, ConfirmacionComponent, MatButton, MatDialogActions, MatDialogContent, MatDialogTitle, MatIcon],
  template: `
    <ng-template #dialogo>
      <h2 mat-dialog-title>{{ titulo() }}</h2>
      <mat-dialog-content>
        @if (error(); as texto) {
          <app-aviso tipo="error">{{ texto }}</app-aviso>
        }
        <div class="formulario"><ng-content /></div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [disabled]="ocupado()" (click)="intentarCerrar()">Cancelar</button>
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="pulsarGuardar()">
          <mat-icon fontIcon="save" aria-hidden="true" />{{ etiquetaGuardar() }}
        </button>
      </mat-dialog-actions>
    </ng-template>
    <app-confirmacion titulo="Descartar cambios" mensaje="Hay cambios sin guardar. ¿Descartarlos?"
                      [(abierta)]="descartando" (confirmar)="cerrar()" />
    @if (mensajeConfirmacion(); as mensaje) {
      <app-confirmacion [titulo]="etiquetaGuardar()" [mensaje]="mensaje"
                        [(abierta)]="confirmandoGuardado" (confirmar)="guardar()" />
    }
  `,
  styles: `
    .formulario {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding-top: 0.5rem;
    }
  `,
})
export class DialogoEdicionComponent {
  private readonly dialogos = inject(MatDialog);
  private readonly plantilla = viewChild.required<TemplateRef<unknown>>('dialogo');
  private referencia: MatDialogRef<unknown> | null = null;

  readonly titulo = input.required<string>();
  readonly abierta = model(false);
  /** Si hay cambios sin guardar, cerrar pide confirmación; sin cambios cierra directo. */
  readonly hayCambios = input(false);
  /** Lo que ocurre al guardar; si rechaza, la ventana sigue abierta con el motivo dentro. */
  readonly alGuardar = input.required<() => Promise<void>>();
  /** Convierte el error de `alGuardar` en el motivo que se muestra (la pantalla conoce el formato). */
  readonly mensajeDeError = input<(error: unknown) => string>(() => 'No se pudo guardar.');
  readonly etiquetaGuardar = input('Guardar');
  /** Con texto, guardar pide antes esta confirmación (p. ej. «Publicar»). */
  readonly mensajeConfirmacion = input<string | null>(null);

  protected readonly error = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly descartando = signal(false);
  protected readonly confirmandoGuardado = signal(false);

  constructor() {
    effect(() => {
      const abierta = this.abierta();
      untracked(() => (abierta ? this.abrir() : this.cerrar()));
    });
    inject(DestroyRef).onDestroy(() => this.referencia?.close());
  }

  protected intentarCerrar(): void {
    if (this.ocupado()) return;
    if (this.hayCambios()) this.descartando.set(true);
    else this.cerrar();
  }

  protected pulsarGuardar(): void {
    if (this.mensajeConfirmacion() !== null) this.confirmandoGuardado.set(true);
    else void this.guardar();
  }

  protected async guardar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await this.alGuardar()();
      this.cerrar();
    } catch (error) {
      this.error.set(this.mensajeDeError()(error));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected cerrar(): void {
    this.referencia?.close();
    this.referencia = null;
    this.abierta.set(false);
  }

  private abrir(): void {
    if (this.referencia !== null) return;
    this.error.set(null);
    const referencia = this.dialogos.open(this.plantilla(), {
      width: '44rem',
      maxWidth: '92vw',
      disableClose: true,
      autoFocus: 'first-tabbable',
    });
    this.referencia = referencia;
    referencia.backdropClick().subscribe(() => this.intentarCerrar());
    referencia
      .keydownEvents()
      .pipe(filter((evento) => evento.key === 'Escape'))
      .subscribe(() => this.intentarCerrar());
    referencia.afterClosed().subscribe(() => {
      if (this.referencia !== referencia) return;
      this.referencia = null;
      this.abierta.set(false);
    });
  }
}
