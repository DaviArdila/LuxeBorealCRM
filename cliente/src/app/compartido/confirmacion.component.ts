import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog, MatDialogActions, MatDialogContent, type MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';

/**
 * Diálogo de confirmación: la acción solo ocurre si la persona pulsa «Confirmar». Se controla con
 * `abierta` (two-way); cerrar con Escape o con el fondo equivale a «Cancelar».
 */
@Component({
  selector: 'app-confirmacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatDialogActions, MatDialogContent, MatDialogTitle, MatIcon],
  template: `
    <ng-template #dialogo>
      <h2 mat-dialog-title>{{ titulo() }}</h2>
      <mat-dialog-content>
        <p class="mensaje">{{ mensaje() }}</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="abierta.set(false)">Cancelar</button>
        <button mat-flat-button type="button" (click)="aceptar()"><mat-icon fontIcon="check" aria-hidden="true" />Confirmar</button>
      </mat-dialog-actions>
    </ng-template>
  `,
  styles: `
    .mensaje {
      margin: 0;
    }
  `,
})
export class ConfirmacionComponent {
  private readonly dialogos = inject(MatDialog);
  private readonly plantilla = viewChild.required<TemplateRef<unknown>>('dialogo');
  private referencia: MatDialogRef<unknown> | null = null;

  readonly titulo = input.required<string>();
  readonly mensaje = input.required<string>();
  readonly abierta = model(false);
  readonly confirmar = output<void>();

  constructor() {
    effect(() => {
      const abierta = this.abierta();
      untracked(() => (abierta ? this.abrir() : this.cerrar()));
    });
    inject(DestroyRef).onDestroy(() => this.cerrar());
  }

  protected aceptar(): void {
    this.confirmar.emit();
    this.abierta.set(false);
  }

  private abrir(): void {
    if (this.referencia !== null) return;
    const referencia = this.dialogos.open(this.plantilla(), { width: '28rem', maxWidth: '92vw', autoFocus: 'dialog' });
    this.referencia = referencia;
    referencia.afterClosed().subscribe(() => {
      if (this.referencia === referencia) this.referencia = null;
      this.abierta.set(false);
    });
  }

  private cerrar(): void {
    this.referencia?.close();
    this.referencia = null;
  }
}
