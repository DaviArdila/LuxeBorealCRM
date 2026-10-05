import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { TextareaModule } from 'primeng/textarea';

/**
 * Editor de texto con contador de caracteres sobre un máximo. El contador solo informa: no recorta ni
 * bloquea lo escrito, porque la regla de validez es del servidor (CLT7).
 */
@Component({
  selector: 'app-editor-con-contador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextareaModule],
  template: `
    <div class="editor">
      <label [for]="idCampo">{{ etiqueta() }}</label>
      <textarea pTextarea [id]="idCampo" rows="12" [fluid]="true" [value]="texto()" [disabled]="deshabilitado()"
                (input)="texto.set($any($event.target).value)"></textarea>
      <small data-contador class="contador" [class.excedido]="excedido()">{{ texto().length }} / {{ maximo() }}</small>
    </div>
  `,
  styles: `
    .editor {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .contador {
      align-self: flex-end;
      color: var(--p-text-muted-color);
    }
    .contador.excedido {
      color: var(--p-red-500);
      font-weight: 600;
    }
  `,
})
export class EditorConContadorComponent {
  private static siguiente = 0;
  protected readonly idCampo = `editor-${EditorConContadorComponent.siguiente++}`;

  readonly etiqueta = input.required<string>();
  readonly maximo = input.required<number>();
  readonly deshabilitado = input(false);
  readonly texto = model.required<string>();

  protected readonly excedido = computed(() => this.texto().length > this.maximo());
}
