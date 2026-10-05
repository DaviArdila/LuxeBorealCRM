import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

/** Diálogo de confirmación: la acción solo ocurre si la persona pulsa «Confirmar». */
@Component({
  selector: 'app-confirmacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, DialogModule],
  template: `
    <p-dialog [header]="titulo()" [modal]="true" [draggable]="false" [style]="{ width: '28rem' }"
              [breakpoints]="{ '640px': '92vw' }" [visible]="abierta()" (visibleChange)="abierta.set($event)">
      <p class="mensaje"><i class="pi pi-exclamation-circle" aria-hidden="true"></i> {{ mensaje() }}</p>
      <ng-template #footer>
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="abierta.set(false)" />
        <p-button label="Confirmar" icon="pi pi-check" (onClick)="aceptar()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .mensaje {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      margin: 0;
    }
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
