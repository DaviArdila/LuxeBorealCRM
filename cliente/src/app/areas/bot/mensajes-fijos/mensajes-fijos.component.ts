import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { AvisoComponent } from '../../../compartido/aviso.component';
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
  imports: [
    AvisoComponent,
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
    <h1>Mensajes fijos</h1>
    @if (error(); as texto) {
      <app-aviso tipo="error">{{ texto }}</app-aviso>
    }
    @if (editando(); as clave) {
      <mat-card appearance="outlined" class="editor">
        <mat-card-header>
          <mat-card-title><h2 class="titulo-tarjeta">Editando {{ clave }}</h2></mat-card-title>
        </mat-card-header>
        <mat-card-content class="formulario">
          <app-editor-con-contador etiqueta="Texto del mensaje" [maximo]="maximo" [(texto)]="borrador"
                                   [deshabilitado]="guardando()" />
          <div class="acciones">
            <button mat-button type="button" [disabled]="guardando()" (click)="cancelar()">Cancelar</button>
            <button mat-flat-button type="button" [disabled]="guardando()" (click)="guardar()">
              <mat-icon fontIcon="save" aria-hidden="true" />Guardar
            </button>
          </div>
        </mat-card-content>
      </mat-card>
    }
    <mat-card appearance="outlined">
      <mat-card-content class="desplazable">
        <table mat-table [dataSource]="servicio.mensajes()" class="tabla">
          <ng-container matColumnDef="mensaje">
            <th mat-header-cell *matHeaderCellDef>Mensaje</th>
            <td mat-cell *matCellDef="let mensaje" class="clave">
              <strong>{{ mensaje.clave }}</strong>
              <p class="descripcion">{{ mensaje.descripcion }}</p>
            </td>
          </ng-container>
          <ng-container matColumnDef="texto">
            <th mat-header-cell *matHeaderCellDef>Texto</th>
            <td mat-cell *matCellDef="let mensaje"><blockquote class="texto">{{ mensaje.texto }}</blockquote></td>
          </ng-container>
          <ng-container matColumnDef="estado">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let mensaje">
              <div class="estado">
                <mat-chip-set>
                  <mat-chip [highlighted]="mensaje.origen === 'base'">
                    {{ mensaje.origen === 'base' ? 'Editado' : 'Texto de respaldo' }}
                  </mat-chip>
                </mat-chip-set>
                @if (mensaje.actualizado) { <small class="fecha">{{ mensaje.actualizado | date: 'dd/MM/yyyy HH:mm' }}</small> }
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="acciones">
            <th mat-header-cell *matHeaderCellDef><span class="oculto">Acciones</span></th>
            <td mat-cell *matCellDef="let mensaje">
              <button mat-stroked-button type="button" [disabled]="guardando()" (click)="editar(mensaje.clave, mensaje.texto)">
                <mat-icon fontIcon="edit" aria-hidden="true" />Editar
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columnas"></tr>
          <tr mat-row *matRowDef="let mensaje; columns: columnas" [attr.data-clave]="mensaje.clave"></tr>
        </table>
      </mat-card-content>
    </mat-card>
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
    .desplazable {
      overflow-x: auto;
    }
    .tabla {
      min-width: 40rem;
    }
    .descripcion {
      margin: 0.25rem 0 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .texto {
      margin: 0;
      padding-left: 0.75rem;
      border-left: 3px solid var(--mat-sys-outline-variant);
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
      color: var(--mat-sys-on-surface-variant);
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
  protected readonly columnas = ['mensaje', 'texto', 'estado', 'acciones'];

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
