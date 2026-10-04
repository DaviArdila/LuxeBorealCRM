import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ConfirmacionComponent } from '../../../compartido/confirmacion.component';
import { EditorConContadorComponent } from '../../../compartido/editor-con-contador.component';
import { leerProblema } from '../../../nucleo/problema';
import { EstiloServicio } from './estilo.servicio';

/** Máximo del texto del estilo (AGT20); el contador lo muestra y el servidor lo hace cumplir. */
const MAXIMO_CARACTERES = 4000;
const LARGO_EXTRACTO = 80;

type Accion = { readonly tipo: 'publicar' } | { readonly tipo: 'restaurar'; readonly version: number };

/** CLT7: ver, editar, publicar y restaurar el estilo del bot sin desplegar. */
@Component({
  selector: 'app-estilo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EstiloServicio],
  imports: [ButtonModule, ConfirmacionComponent, DatePipe, EditorConContadorComponent, MessageModule],
  template: `
    <h1>Estilo del bot</h1>
    @if (servicio.vigente(); as vigente) {
      <p>
        @if (vigente.version !== null) { <strong>Versión {{ vigente.version }}</strong> } @else { <strong>Sin versión publicada</strong> }
        · origen: {{ vigente.origen }}
      </p>
    }
    @if (recordatorioEvals()) {
      <p-message severity="info">
        Un estilo nuevo exige correr las evals reales antes de llegar a clientes
        (<code>EVALS_MODO=real npm run evals</code>).
      </p-message>
    }
    @if (motivo(); as texto) {
      <p-message severity="error" role="alert">{{ texto }}</p-message>
    }
    <app-editor-con-contador etiqueta="Texto del estilo" [maximo]="maximo" [(texto)]="borrador" [deshabilitado]="ocupado()" />
    <p-button label="Publicar" [disabled]="ocupado()" (onClick)="accion.set({ tipo: 'publicar' })" />

    <h2>Historial</h2>
    <ul class="historial">
      @for (version of servicio.historial(); track version.version) {
        <li>
          <strong>Versión {{ version.version }}</strong> · {{ version.fecha | date: 'dd/MM/yyyy HH:mm' }}
          <p>{{ versionAbierta() === version.version ? version.texto : extracto(version.texto) }}</p>
          <p-button [label]="versionAbierta() === version.version ? 'Ocultar texto' : 'Ver texto'" severity="secondary"
                    (onClick)="alternarTexto(version.version)" />
          <p-button label="Restaurar" severity="secondary" [disabled]="ocupado()"
                    (onClick)="accion.set({ tipo: 'restaurar', version: version.version })" />
        </li>
      }
    </ul>

    <app-confirmacion [titulo]="tituloConfirmacion()" [mensaje]="mensajeConfirmacion()"
                      [abierta]="accion() !== null" (abiertaChange)="cerrarConfirmacion($event)"
                      (confirmar)="ejecutar()" />
  `,
})
export class EstiloComponent {
  protected readonly servicio = inject(EstiloServicio);
  protected readonly maximo = MAXIMO_CARACTERES;

  protected readonly borrador = signal('');
  protected readonly motivo = signal<string | null>(null);
  protected readonly recordatorioEvals = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly accion = signal<Accion | null>(null);
  protected readonly versionAbierta = signal<number | null>(null);

  constructor() {
    void this.cargar();
  }

  protected extracto(texto: string): string {
    return texto.length > LARGO_EXTRACTO ? `${texto.slice(0, LARGO_EXTRACTO)}…` : texto;
  }

  protected alternarTexto(version: number): void {
    this.versionAbierta.update((actual) => (actual === version ? null : version));
  }

  protected tituloConfirmacion(): string {
    return this.accion()?.tipo === 'restaurar' ? 'Restaurar estilo' : 'Publicar estilo';
  }

  protected mensajeConfirmacion(): string {
    const accion = this.accion();
    return accion?.tipo === 'restaurar'
      ? `¿Restaurar la versión ${accion.version}? Pasará a ser el estilo vigente del bot.`
      : '¿Publicar este texto como estilo vigente del bot?';
  }

  protected cerrarConfirmacion(abierta: boolean): void {
    if (!abierta) this.accion.set(null);
  }

  /** Publica o restaura según lo confirmado; ante un rechazo deja lo escrito y muestra el motivo del servidor. */
  protected async ejecutar(): Promise<void> {
    const accion = this.accion();
    if (accion === null) return;
    this.ocupado.set(true);
    this.motivo.set(null);
    try {
      if (accion.tipo === 'publicar') await this.servicio.publicar(this.borrador());
      else await this.servicio.restaurar(accion.version);
      this.recordatorioEvals.set(true);
      await this.cargar();
    } catch (error) {
      const problema = leerProblema(error);
      this.motivo.set(problema.motivo ?? problema.titulo);
    } finally {
      this.ocupado.set(false);
    }
  }

  private async cargar(): Promise<void> {
    try {
      await this.servicio.cargar();
      const vigente = this.servicio.vigente();
      if (vigente) this.borrador.set(vigente.texto);
    } catch (error) {
      const problema = leerProblema(error);
      this.motivo.set(problema.motivo ?? problema.titulo);
    }
  }
}
