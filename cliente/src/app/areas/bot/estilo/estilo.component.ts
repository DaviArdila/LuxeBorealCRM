import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { AvisoComponent } from '../../../compartido/aviso.component';
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
    AvisoComponent,
    ConfirmacionComponent,
    DatePipe,
    EditorConContadorComponent,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardTitle,
    MatChip,
    MatChipSet,
    MatIcon,
    MatTableModule,
  ],
  template: `
    <h1>Estilo del bot</h1>
    @if (recordatorioEvals()) {
      <app-aviso tipo="info">
        Un estilo nuevo exige correr las evals reales antes de llegar a clientes
        (<code>EVALS_MODO=real npm run evals</code>).
      </app-aviso>
    }
    @if (motivo(); as texto) {
      <app-aviso tipo="error">{{ texto }}</app-aviso>
    }
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>
          @if (servicio.vigente(); as vigente) {
            <span class="vigente">
              @if (vigente.version !== null) { <strong>Versión {{ vigente.version }}</strong> } @else { <strong>Sin versión publicada</strong> }
              · origen: {{ vigente.origen }}
            </span>
          }
        </mat-card-title>
      </mat-card-header>
      <mat-card-content class="formulario">
        <app-editor-con-contador etiqueta="Texto del estilo" [maximo]="maximo" [(texto)]="borrador" [deshabilitado]="ocupado()" />
        <div class="acciones">
          <button mat-flat-button type="button" [disabled]="ocupado()" (click)="accion.set({ tipo: 'publicar' })">
            <mat-icon fontIcon="upload" aria-hidden="true" />Publicar
          </button>
        </div>
      </mat-card-content>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title><h2 class="titulo-tarjeta">Historial</h2></mat-card-title>
      </mat-card-header>
      <mat-card-content class="desplazable">
        <table mat-table [dataSource]="servicio.historial()" class="tabla">
          <ng-container matColumnDef="version">
            <th mat-header-cell *matHeaderCellDef>Versión</th>
            <td mat-cell *matCellDef="let version">
              <mat-chip-set><mat-chip>Versión {{ version.version }}</mat-chip></mat-chip-set>
            </td>
          </ng-container>
          <ng-container matColumnDef="fecha">
            <th mat-header-cell *matHeaderCellDef>Fecha</th>
            <td mat-cell *matCellDef="let version" class="fecha">{{ version.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
          </ng-container>
          <ng-container matColumnDef="texto">
            <th mat-header-cell *matHeaderCellDef>Texto</th>
            <td mat-cell *matCellDef="let version" class="texto">
              {{ versionAbierta() === version.version ? version.texto : extracto(version.texto) }}
            </td>
          </ng-container>
          <ng-container matColumnDef="acciones">
            <th mat-header-cell *matHeaderCellDef><span class="oculto">Acciones</span></th>
            <td mat-cell *matCellDef="let version">
              <div class="acciones-fila">
                <button mat-button type="button" (click)="alternarTexto(version.version)">
                  {{ versionAbierta() === version.version ? 'Ocultar texto' : 'Ver texto' }}
                </button>
                <button mat-stroked-button type="button" [disabled]="ocupado()"
                        (click)="accion.set({ tipo: 'restaurar', version: version.version })">
                  <mat-icon fontIcon="history" aria-hidden="true" />Restaurar
                </button>
              </div>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columnas"></tr>
          <tr mat-row *matRowDef="let version; columns: columnas"></tr>
        </table>
      </mat-card-content>
    </mat-card>

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
    .desplazable {
      overflow-x: auto;
    }
    .tabla {
      min-width: 36rem;
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
  protected readonly columnas = ['version', 'fecha', 'texto', 'acciones'];

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
