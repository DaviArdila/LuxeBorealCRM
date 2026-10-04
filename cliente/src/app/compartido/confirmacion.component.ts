import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

/** Diálogo de confirmación: la acción solo ocurre si la persona pulsa «Confirmar». */
@Component({
  selector: 'app-confirmacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, DialogModule],
  template: `
    <p-dialog [header]="titulo()" [modal]="true" [visible]="abierta()" (visibleChange)="abierta.set($event)">
      <p>{{ mensaje() }}</p>
      <ng-template #footer>
        <p-button label="Cancelar" severity="secondary" (onClick)="abierta.set(false)" />
        <p-button label="Confirmar" (onClick)="aceptar()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ConfirmacionComponent {
  readonly titulo = input.required<string>();
  readonly mensaje = input.required<string>();
  readonly abierta = model(false);
  readonly confirmar = output<void>();

  protected aceptar(): void {
    this.confirmar.emit();
    this.abierta.set(false);
  }
}
