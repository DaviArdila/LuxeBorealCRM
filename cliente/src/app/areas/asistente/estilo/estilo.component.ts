import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { AvisoComponent } from '../../../compartido/aviso.component';
import { ConfirmacionComponent } from '../../../compartido/confirmacion.component';
import { DialogoEdicionComponent } from '../../../compartido/dialogo-edicion.component';
import { EditorConContadorComponent } from '../../../compartido/editor-con-contador.component';
import { leerProblema } from '../../../nucleo/problema';
import { EstiloServicio, type SeccionDelEstilo } from './estilo.servicio';

/** Tope del título de una sección; el contador lo muestra y el servidor lo hace cumplir. */
const MAXIMO_TITULO = 100;
/** Desde esta fracción del tope compuesto la pantalla avisa que el estilo está cerca de llenarse. */
const FRACCION_DE_AVISO = 0.9;
const LARGO_EXTRACTO = 80;
const LARGO_EXTRACTO_SECCION = 160;

interface Restauracion {
  readonly version: number;
}

/** SHL9: el estilo del bot en secciones (crear, editar, ordenar, apagar) con su historial y restauración. */
@Component({
  selector: 'app-estilo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EstiloServicio],
  imports: [
    AvisoComponent,
    ConfirmacionComponent,
    DatePipe,
    DialogoEdicionComponent,
    EditorConContadorComponent,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardTitle,
    MatChip,
    MatChipSet,
    MatFormField,
    MatHint,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatSlideToggle,
    MatTableModule,
  ],
  template: `
    <h1>Estilo del bot</h1>
    <app-aviso tipo="info">
      Aquí se edita cómo habla el bot, en secciones que se ordenan y se pueden apagar. Lo que responde en cada
      situación se edita en «Casos de uso».
    </app-aviso>
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
              @if (vigente.origen === 'base') { · publicado por {{ vigente.publicadoPor?.nombre ?? 'Comando' }} }
            </span>
          }
        </mat-card-title>
      </mat-card-header>
      <mat-card-content class="secciones">
        <div class="barra">
          <span data-contador-global [class.excedido]="cercaDelTope()">
            {{ servicio.caracteresCompuestos() }} / {{ servicio.maximo() }} caracteres en total
          </span>
          <button mat-flat-button type="button" [disabled]="ocupado()" (click)="nuevaSeccion()">
            <mat-icon fontIcon="add" aria-hidden="true" />Nueva sección
          </button>
        </div>
        @if (cercaDelTope()) {
          <app-aviso tipo="info">
            <span data-aviso-tope>El estilo está cerca del tope: solo cuentan las secciones activas.</span>
          </app-aviso>
        }
        @for (seccion of servicio.secciones(); track seccion.id; let primera = $first; let ultima = $last) {
          <div class="seccion" data-seccion [class.apagada]="!seccion.activo">
            <div class="cabecera">
              <strong>{{ seccion.titulo }}</strong>
              <span class="cuenta">{{ seccion.texto.length }} caracteres</span>
              @if (!seccion.activo) { <span class="cuenta">Apagada</span> }
              <span class="acciones-seccion">
                <mat-slide-toggle [checked]="seccion.activo" [disabled]="ocupado()"
                                  [attr.aria-label]="'Activar ' + seccion.titulo"
                                  (change)="alternar(seccion, $event.checked, $event.source)" />
                <button mat-icon-button type="button" [disabled]="primera || ocupado()"
                        [attr.aria-label]="'Subir ' + seccion.titulo" (click)="mover(seccion, -1)">
                  <mat-icon fontIcon="arrow_upward" aria-hidden="true" />
                </button>
                <button mat-icon-button type="button" [disabled]="ultima || ocupado()"
                        [attr.aria-label]="'Bajar ' + seccion.titulo" (click)="mover(seccion, 1)">
                  <mat-icon fontIcon="arrow_downward" aria-hidden="true" />
                </button>
                <button mat-icon-button type="button" [disabled]="ocupado()"
                        [attr.aria-label]="'Editar ' + seccion.titulo" (click)="editarSeccion(seccion)">
                  <mat-icon fontIcon="edit" aria-hidden="true" />
                </button>
              </span>
            </div>
            <p class="texto-seccion">{{ extracto(seccion.texto, largoSeccion) }}</p>
          </div>
        }
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
          <ng-container matColumnDef="autor">
            <th mat-header-cell *matHeaderCellDef>Publicó</th>
            <td mat-cell *matCellDef="let version">{{ version.publicadoPor?.nombre ?? 'Comando' }}</td>
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
                        (click)="restauracion.set({ version: version.version })">
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

    <app-dialogo-edicion [titulo]="editandoId() === null ? 'Nueva sección' : 'Editar sección'" [(abierta)]="editando"
                         [hayCambios]="true" [alGuardar]="guardar" [mensajeDeError]="motivoDe">
      <mat-form-field appearance="outline">
        <mat-label>Título</mat-label>
        <input matInput data-campo="titulo" [value]="titulo()" (input)="titulo.set($any($event.target).value)" />
        <mat-hint align="end">{{ titulo().length }} / {{ maximoTitulo }}</mat-hint>
      </mat-form-field>
      <app-editor-con-contador etiqueta="Texto de la sección" campo="texto" [filas]="8" [maximo]="servicio.maximo()"
                               [(texto)]="texto" />
    </app-dialogo-edicion>
    <app-confirmacion titulo="Restaurar estilo" [mensaje]="mensajeRestauracion()"
                      [abierta]="restauracion() !== null" (abiertaChange)="cerrarConfirmacion($event)"
                      (confirmar)="restaurar()" />
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
    .secciones {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .barra {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      justify-content: space-between;
    }
    [data-contador-global].excedido {
      color: var(--mat-sys-error);
      font-weight: 600;
    }
    .seccion {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-block: 0.5rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .seccion.apagada {
      opacity: 0.6;
    }
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .cuenta {
      color: var(--mat-sys-on-surface-variant);
    }
    .acciones-seccion {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-inline-start: auto;
    }
    .texto-seccion {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
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
  protected readonly maximoTitulo = MAXIMO_TITULO;
  protected readonly largoSeccion = LARGO_EXTRACTO_SECCION;
  protected readonly columnas = ['version', 'fecha', 'autor', 'texto', 'acciones'];

  protected readonly motivo = signal<string | null>(null);
  protected readonly recordatorioEvals = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly restauracion = signal<Restauracion | null>(null);
  protected readonly versionAbierta = signal<number | null>(null);
  protected readonly cercaDelTope = computed(
    () => this.servicio.caracteresCompuestos() >= this.servicio.maximo() * FRACCION_DE_AVISO,
  );

  protected readonly editando = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  protected readonly titulo = signal('');
  protected readonly texto = signal('');
  private actualizadoDeLaSeccion = '';

  constructor() {
    void this.cargar();
  }

  protected extracto(texto: string, largo = LARGO_EXTRACTO): string {
    return texto.length > largo ? `${texto.slice(0, largo)}…` : texto;
  }

  protected alternarTexto(version: number): void {
    this.versionAbierta.update((actual) => (actual === version ? null : version));
  }

  /** El motivo que se muestra: el del servidor; ante una marca vieja, además, lo que hizo la pantalla. */
  protected readonly motivoDe = (error: unknown): string => {
    const problema = leerProblema(error);
    const motivo = problema.motivo ?? problema.titulo;
    return problema.codigo === 'seccion-modificada'
      ? `Alguien modificó esta sección. Recargamos la lista; revisa y vuelve a guardar. (${motivo})`
      : motivo;
  };

  // --- Secciones ---

  protected nuevaSeccion(): void {
    this.editandoId.set(null);
    this.titulo.set('');
    this.texto.set('');
    this.editando.set(true);
  }

  protected editarSeccion(seccion: SeccionDelEstilo): void {
    this.editandoId.set(seccion.id);
    this.actualizadoDeLaSeccion = seccion.actualizado;
    this.titulo.set(seccion.titulo);
    this.texto.set(seccion.texto);
    this.editando.set(true);
  }

  /** Lo que hace «Guardar» en la ventana; un rechazo deja la ventana abierta con el motivo del servidor. */
  protected readonly guardar = async (): Promise<void> => {
    const id = this.editandoId();
    try {
      if (id === null) await this.servicio.crear({ titulo: this.titulo(), texto: this.texto(), activo: true });
      else await this.servicio.editar(id, { actualizado: this.actualizadoDeLaSeccion, titulo: this.titulo(), texto: this.texto() });
    } catch (error) {
      if (id !== null && leerProblema(error).codigo === 'seccion-modificada') await this.alCambiarPorOtro(id);
      throw error;
    }
    this.recordatorioEvals.set(true);
    await this.cargar();
  };

  /** Recarga la lista y toma la marca nueva de la sección: reintentar queda como decisión de quien edita. */
  private async alCambiarPorOtro(id: string): Promise<void> {
    await this.cargar();
    const vigente = this.servicio.secciones().find((s) => s.id === id);
    if (vigente !== undefined) this.actualizadoDeLaSeccion = vigente.actualizado;
  }

  protected async alternar(seccion: SeccionDelEstilo, activo: boolean, interruptor?: { checked: boolean }): Promise<void> {
    await this.mutar(async () => {
      try {
        await this.servicio.editar(seccion.id, { actualizado: seccion.actualizado, activo });
      } catch (error) {
        // Cualquier rechazo: el interruptor ya cambió en pantalla, la lista recargada lo devuelve al estado del servidor.
        await this.cargar();
        // Si el servidor conserva el mismo valor, el enlace `[checked]` no cambia y no repinta: se devuelve a mano.
        if (interruptor !== undefined) interruptor.checked = this.servicio.secciones().find((s) => s.id === seccion.id)?.activo ?? seccion.activo;
        throw error;
      }
      this.recordatorioEvals.set(true);
      await this.cargar();
    });
  }

  /** Mueve la sección una posición y manda el orden completo. */
  protected async mover(seccion: SeccionDelEstilo, sentido: -1 | 1): Promise<void> {
    const ids = this.servicio.secciones().map((s) => s.id);
    const desde = ids.indexOf(seccion.id);
    const hacia = desde + sentido;
    if (hacia < 0 || hacia >= ids.length) return;
    [ids[desde], ids[hacia]] = [ids[hacia]!, ids[desde]!];
    await this.mutar(async () => {
      await this.servicio.ordenar(ids);
      this.recordatorioEvals.set(true);
      // Reordenar publica una versión nueva: se relee también la vigente y el historial.
      await this.cargar();
    });
  }

  private async mutar(accion: () => Promise<void>): Promise<void> {
    this.ocupado.set(true);
    this.motivo.set(null);
    try {
      await accion();
    } catch (error) {
      this.motivo.set(this.motivoDe(error));
    } finally {
      this.ocupado.set(false);
    }
  }

  // --- Historial ---

  protected mensajeRestauracion(): string {
    return `¿Restaurar la versión ${this.restauracion()?.version}? Reemplazará las secciones actuales del bot.`;
  }

  protected cerrarConfirmacion(abierta: boolean): void {
    if (!abierta) this.restauracion.set(null);
  }

  /** Restaura la versión confirmada y recarga las secciones; ante un rechazo muestra el motivo del servidor. */
  protected async restaurar(): Promise<void> {
    const restauracion = this.restauracion();
    if (restauracion === null) return;
    await this.mutar(async () => {
      await this.servicio.restaurar(restauracion.version);
      this.recordatorioEvals.set(true);
      await this.cargar();
    });
  }

  private async cargar(): Promise<void> {
    try {
      await this.servicio.cargar();
    } catch (error) {
      this.motivo.set(this.motivoDe(error));
    }
  }
}
