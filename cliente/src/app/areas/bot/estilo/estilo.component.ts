import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
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
  imports: [
    ButtonModule,
    CardModule,
    ConfirmacionComponent,
    DatePipe,
    EditorConContadorComponent,
    MessageModule,
    TableModule,
    TagModule,
  ],
  template: `
    <h1>Estilo del bot</h1>
    @if (recordatorioEvals()) {
      <p-message severity="info" icon="pi pi-info-circle">
        Un estilo nuevo exige correr las evals reales antes de llegar a clientes
        (<code>EVALS_MODO=real npm run evals</code>).
      </p-message>
    }
    @if (motivo(); as texto) {
      <p-message severity="error" role="alert">{{ texto }}</p-message>
    }
    <p-card>
      <ng-template #title>
        @if (servicio.vigente(); as vigente) {
          <span class="vigente">
            @if (vigente.version !== null) { <strong>Versión {{ vigente.version }}</strong> } @else { <strong>Sin versión publicada</strong> }
            · origen: {{ vigente.origen }}
          </span>
        }
      </ng-template>
      <div class="formulario">
        <app-editor-con-contador etiqueta="Texto del estilo" [maximo]="maximo" [(texto)]="borrador" [deshabilitado]="ocupado()" />
        <div class="acciones">
          <p-button label="Publicar" icon="pi pi-upload" [disabled]="ocupado()" (onClick)="accion.set({ tipo: 'publicar' })" />
        </div>
      </div>
    </p-card>

    <p-card>
      <ng-template #title><h2 class="titulo-tarjeta">Historial</h2></ng-template>
      <p-table [value]="servicio.historial()" dataKey="version" [tableStyle]="{ 'min-width': '36rem' }">
        <ng-template #header>
          <tr>
            <th>Versión</th>
            <th>Fecha</th>
            <th>Texto</th>
            <th><span class="oculto">Acciones</span></th>
          </tr>
        </ng-template>
        <ng-template #body let-version>
          <tr>
            <td><p-tag [value]="'Versión ' + version.version" severity="secondary" /></td>
            <td class="fecha">{{ version.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
            <td class="texto">{{ versionAbierta() === version.version ? version.texto : extracto(version.texto) }}</td>
            <td>
              <div class="acciones-fila">
                <p-button [label]="versionAbierta() === version.version ? 'Ocultar texto' : 'Ver texto'" severity="secondary"
                          [text]="true" size="small" (onClick)="alternarTexto(version.version)" />
                <p-button label="Restaurar" icon="pi pi-history" severity="secondary" [outlined]="true" size="small"
                          [disabled]="ocupado()" (onClick)="accion.set({ tipo: 'restaurar', version: version.version })" />
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </p-card>

    <app-confirmacion [titulo]="tituloConfirmacion()" [mensaje]="mensajeConfirmacion()"
                      [abierta]="accion() !== null" (abiertaChange)="cerrarConfirmacion($event)"
                      (confirmar)="ejecutar()" />
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
    }
    .acciones-fila {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .fecha {
      white-space: nowrap;
    }
    .texto {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
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
