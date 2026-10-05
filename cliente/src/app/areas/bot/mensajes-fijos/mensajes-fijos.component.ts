import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { EditorConContadorComponent } from '../../../compartido/editor-con-contador.component';
import { leerProblema } from '../../../nucleo/problema';
import { MensajesFijosServicio } from './mensajes-fijos.servicio';

/** Máximo del texto de un mensaje fijo (CLT8); el contador lo muestra y el servidor lo hace cumplir. */
const MAXIMO_CARACTERES = 1000;

/** CLT8: ver y editar los diez mensajes fijos del bot sin desplegar. */
@Component({
  selector: 'app-mensajes-fijos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MensajesFijosServicio],
  imports: [ButtonModule, CardModule, DatePipe, EditorConContadorComponent, MessageModule, TableModule, TagModule],
  template: `
    <h1>Mensajes fijos</h1>
    @if (error(); as texto) {
      <p-message severity="error" role="alert">{{ texto }}</p-message>
    }
    @if (editando(); as clave) {
      <p-card class="editor">
        <ng-template #title><h2 class="titulo-tarjeta">Editando {{ clave }}</h2></ng-template>
        <div class="formulario">
          <app-editor-con-contador etiqueta="Texto del mensaje" [maximo]="maximo" [(texto)]="borrador"
                                   [deshabilitado]="guardando()" />
          <div class="acciones">
            <p-button label="Cancelar" severity="secondary" [text]="true" [disabled]="guardando()" (onClick)="cancelar()" />
            <p-button label="Guardar" icon="pi pi-save" [disabled]="guardando()" (onClick)="guardar()" />
          </div>
        </div>
      </p-card>
    }
    <p-card>
      <p-table [value]="servicio.mensajes()" dataKey="clave" [tableStyle]="{ 'min-width': '40rem' }">
        <ng-template #header>
          <tr>
            <th>Mensaje</th>
            <th>Texto</th>
            <th>Estado</th>
            <th><span class="oculto">Acciones</span></th>
          </tr>
        </ng-template>
        <ng-template #body let-mensaje>
          <tr [attr.data-clave]="mensaje.clave">
            <td class="clave">
              <strong>{{ mensaje.clave }}</strong>
              <p class="descripcion">{{ mensaje.descripcion }}</p>
            </td>
            <td><blockquote class="texto">{{ mensaje.texto }}</blockquote></td>
            <td>
              <div class="estado">
                <p-tag [value]="mensaje.origen === 'base' ? 'Editado' : 'Texto de respaldo'"
                       [severity]="mensaje.origen === 'base' ? 'success' : 'secondary'" />
                @if (mensaje.actualizado) { <small class="fecha">{{ mensaje.actualizado | date: 'dd/MM/yyyy HH:mm' }}</small> }
              </div>
            </td>
            <td>
              <p-button label="Editar" icon="pi pi-pencil" severity="secondary" [outlined]="true" size="small"
                        [disabled]="guardando()" (onClick)="editar(mensaje.clave, mensaje.texto)" />
            </td>
          </tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    h1,
    .titulo-tarjeta {
      margin: 0;
    }
    .titulo-tarjeta {
      font-size: inherit;
    }
    .formulario {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .acciones {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .descripcion {
      margin: 0.25rem 0 0;
      color: var(--p-text-muted-color);
      font-size: 0.875rem;
    }
    .texto {
      margin: 0;
      padding-left: 0.75rem;
      border-left: 3px solid var(--p-content-border-color);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .estado {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }
    .fecha {
      color: var(--p-text-muted-color);
      white-space: nowrap;
    }
    .oculto {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
})
export class MensajesFijosComponent {
  protected readonly servicio = inject(MensajesFijosServicio);
  protected readonly maximo = MAXIMO_CARACTERES;

  protected readonly editando = signal<string | null>(null);
  protected readonly borrador = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);

  constructor() {
    void this.cargar();
  }

  protected editar(clave: string, texto: string): void {
    this.error.set(null);
    this.borrador.set(texto);
    this.editando.set(clave);
  }

  protected cancelar(): void {
    this.error.set(null);
    this.editando.set(null);
  }

  /** Ante un rechazo del servidor deja el editor abierto con lo escrito y muestra el motivo. */
  protected async guardar(): Promise<void> {
    const clave = this.editando();
    if (clave === null) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.servicio.guardar(clave, this.borrador());
      this.editando.set(null);
    } catch (error) {
      const problema = leerProblema(error);
      this.error.set(problema.motivo ?? problema.titulo);
    } finally {
      this.guardando.set(false);
    }
  }

  private async cargar(): Promise<void> {
    try {
      await this.servicio.cargar();
    } catch (error) {
      const problema = leerProblema(error);
      this.error.set(problema.motivo ?? problema.titulo);
    }
  }
}
