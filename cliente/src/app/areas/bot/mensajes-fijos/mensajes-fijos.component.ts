import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
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
  imports: [ButtonModule, DatePipe, EditorConContadorComponent, MessageModule],
  template: `
    <h1>Mensajes fijos</h1>
    @if (error(); as texto) {
      <p-message severity="error" role="alert">{{ texto }}</p-message>
    }
    @if (editando(); as clave) {
      <section class="editor">
        <h2>Editando {{ clave }}</h2>
        <app-editor-con-contador etiqueta="Texto del mensaje" [maximo]="maximo" [(texto)]="borrador"
                                 [deshabilitado]="guardando()" />
        <p-button label="Guardar" [disabled]="guardando()" (onClick)="guardar()" />
        <p-button label="Cancelar" severity="secondary" [disabled]="guardando()" (onClick)="cancelar()" />
      </section>
    }
    <ul class="mensajes">
      @for (mensaje of servicio.mensajes(); track mensaje.clave) {
        <li [attr.data-clave]="mensaje.clave">
          <p-button label="Editar" severity="secondary" [disabled]="guardando()" (onClick)="editar(mensaje.clave, mensaje.texto)" />
          <strong>{{ mensaje.clave }}</strong>
          <p>{{ mensaje.descripcion }}</p>
          <blockquote>{{ mensaje.texto }}</blockquote>
          <small>
            {{ mensaje.origen === 'base' ? 'Editado' : 'Texto de respaldo' }}
            @if (mensaje.actualizado) { · {{ mensaje.actualizado | date: 'dd/MM/yyyy HH:mm' }} }
          </small>
        </li>
      }
    </ul>
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
