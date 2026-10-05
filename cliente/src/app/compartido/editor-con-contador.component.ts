import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

/**
 * Editor de texto con contador de caracteres sobre un máximo. El contador solo informa: no recorta ni
 * bloquea lo escrito, porque la regla de validez es del servidor (CLT7).
 */
@Component({
  selector: 'app-editor-con-contador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormField, MatHint, MatInput, MatLabel],
  template: `
    <mat-form-field appearance="outline" class="editor">
      <mat-label>{{ etiqueta() }}</mat-label>
      <textarea matInput rows="12" [value]="texto()" [disabled]="deshabilitado()"
                (input)="texto.set($any($event.target).value)"></textarea>
      <mat-hint align="end" data-contador class="contador" [class.excedido]="excedido()">
        {{ texto().length }} / {{ maximo() }}
      </mat-hint>
    </mat-form-field>
  `,
  styles: `
    .editor {
      width: 100%;
    }
    .contador.excedido {
      color: var(--mat-sys-error);
      font-weight: 600;
    }
  `,
})
export class EditorConContadorComponent {
  readonly etiqueta = input.required<string>();
  readonly maximo = input.required<number>();
  readonly deshabilitado = input(false);
  readonly texto = model.required<string>();

  protected readonly excedido = computed(() => this.texto().length > this.maximo());
}
