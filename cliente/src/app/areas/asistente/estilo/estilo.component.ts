import { CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal, TemplateRef, viewChild } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, type MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { AvisoComponent } from '../../../compartido/aviso.component';
import { CabeceraPaginaComponent } from '../../../compartido/cabecera-pagina.component';
import { ConfirmacionComponent } from '../../../compartido/confirmacion.component';
import { DialogoEdicionComponent } from '../../../compartido/dialogo-edicion.component';
import { EditorConContadorComponent } from '../../../compartido/editor-con-contador.component';
import { RejillaComponent } from '../../../compartido/rejilla.component';
import { TarjetaElementoComponent } from '../../../compartido/tarjeta-elemento.component';
import { leerProblema } from '../../../nucleo/problema';
import { EstiloServicio, type SeccionDelEstilo } from './estilo.servicio';

/** Tope del título de una sección; el contador lo muestra y el servidor lo hace cumplir. */
const MAXIMO_TITULO = 100;
/** Desde esta fracción del tope compuesto la pantalla avisa que el estilo está cerca de llenarse. */
const FRACCION_DE_AVISO = 0.9;
const LARGO_EXTRACTO = 80;
const AYUDA =
  'Aquí se edita cómo habla el bot, en secciones que se ordenan arrastrándolas y se pueden apagar. ' +
  'Lo que responde en cada situación se edita en «Casos de uso».';

interface Restauracion {
  readonly version: number;
}

/**
 * SHL9: el estilo del bot en secciones (crear, editar, ordenar, apagar). Las secciones son tarjetas de una
 * rejilla que se reordenan arrastrando (en la ventana de edición hay un campo «Posición» para hacerlo con
 * teclado); el historial y la restauración viven en una ventana que abre el botón «Historial».
 */
@Component({
  selector: 'app-estilo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EstiloServicio],
  imports: [
    AvisoComponent,
    CabeceraPaginaComponent,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    ConfirmacionComponent,
    DatePipe,
    DialogoEdicionComponent,
    EditorConContadorComponent,
    MatButton,
    MatChip,
    MatChipSet,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatHint,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatSlideToggle,
    MatTableModule,
    RejillaComponent,
    TarjetaElementoComponent,
  ],
  template: `
    <app-cabecera-pagina titulo="Estilo del bot" [ayuda]="ayuda">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="buscador">
        <mat-label>Buscar sección</mat-label>
        <input matInput type="search" data-campo="buscar-seccion" [value]="busqueda()"
               (input)="busqueda.set($any($event.target).value)" />
      </mat-form-field>
      <span class="medidor" data-contador-global [class.cerca]="cercaDelTope()" [class.excedido]="excedido()">
        <span class="cifras">{{ servicio.caracteresCompuestos() }} / {{ servicio.maximo() }} caracteres en total</span>
        <span class="barra-medidor" role="meter" aria-label="Caracteres usados" aria-valuemin="0"
              [attr.aria-valuemax]="servicio.maximo()" [attr.aria-valuenow]="servicio.caracteresCompuestos()">
          <span class="relleno" [style.width.%]="porcentaje()"></span>
        </span>
      </span>
      <button mat-flat-button type="button" [disabled]="ocupado()" (click)="nuevaSeccion()">
        <mat-icon fontIcon="add" aria-hidden="true" />Nueva sección
      </button>
      <button mat-icon-button type="button" data-accion="historial" aria-label="Historial" (click)="abrirHistorial()">
        <mat-icon fontIcon="history" aria-hidden="true" />
      </button>
    </app-cabecera-pagina>

    @if (servicio.vigente(); as vigente) {
      <p class="vigente">
        @if (vigente.version !== null) { <strong>Versión {{ vigente.version }}</strong> } @else { <strong>Sin versión publicada</strong> }
        · origen: {{ vigente.origen }}
        @if (vigente.origen === 'base') { · publicado por {{ vigente.publicadoPor?.nombre ?? 'Comando' }} }
      </p>
    }
    @if (motivo(); as texto) {
      <app-aviso tipo="error" [flotante]="true" [descartable]="true" (descartar)="motivo.set(null)">{{ texto }}</app-aviso>
    }
    @if (recordatorioEvals()) {
      <app-aviso tipo="info" [flotante]="true" [nivel]="1" [descartable]="true" (descartar)="recordatorioEvals.set(false)">
        Un estilo nuevo exige correr las evals reales antes de llegar a clientes
        (<code>EVALS_MODO=real npm run evals</code>).
      </app-aviso>
    }
    @if (cercaDelTope()) {
      <app-aviso tipo="info" [flotante]="true" [nivel]="2">
        <span data-aviso-tope>El estilo está cerca del tope: solo cuentan las secciones activas.</span>
      </app-aviso>
    }

    @if (visibles().length === 0 && busqueda().trim() !== '') {
      <p data-sin-resultados>Ninguna sección coincide con la búsqueda.</p>
    }
    <app-rejilla cdkDropList cdkDropListOrientation="mixed" (cdkDropListDropped)="soltar($event)">
      @for (seccion of visibles(); track seccion.id) {
        <app-tarjeta-elemento data-seccion cdkDrag [cdkDragDisabled]="reordenDeshabilitado()" [titulo]="seccion.titulo"
          [etiquetas]="etiquetasDe(seccion)" [vista]="seccion.texto" [atenuada]="!seccion.activo" [clicable]="true"
          (abrir)="editarSeccion(seccion)">
          <span acciones>
            <span class="asa" cdkDragHandle aria-hidden="true" title="Arrastrar para reordenar">
              <mat-icon fontIcon="drag_indicator" aria-hidden="true" />
            </span>
            <mat-slide-toggle [checked]="seccion.activo" [disabled]="ocupado()"
                              [attr.aria-label]="'Activar ' + seccion.titulo"
                              (change)="alternar(seccion, $event.checked, $event.source)" />
            <button mat-icon-button type="button" [disabled]="ocupado()"
                    [attr.aria-label]="'Editar ' + seccion.titulo" (click)="editarSeccion(seccion)">
              <mat-icon fontIcon="edit" aria-hidden="true" />
            </button>
          </span>
        </app-tarjeta-elemento>
      }
    </app-rejilla>

    <ng-template #plantillaHistorial>
      <h2 mat-dialog-title>Historial</h2>
      <mat-dialog-content>
        <div class="desplazable">
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
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cerrar</button>
      </mat-dialog-actions>
    </ng-template>

    <app-dialogo-edicion [titulo]="editandoId() === null ? 'Nueva sección' : 'Editar sección'" [(abierta)]="editando"
                         [hayCambios]="true" [alGuardar]="guardar" [mensajeDeError]="motivoDe">
      <mat-form-field appearance="outline">
        <mat-label>Título</mat-label>
        <input matInput data-campo="titulo" [value]="titulo()" (input)="titulo.set($any($event.target).value)" />
        <mat-hint align="end">{{ titulo().length }} / {{ maximoTitulo }}</mat-hint>
      </mat-form-field>
      <app-editor-con-contador etiqueta="Texto de la sección" campo="texto" [filas]="8" [maximo]="servicio.maximo()"
                               [(texto)]="texto" />
      @if (editandoId() !== null) {
        <mat-form-field appearance="outline">
          <mat-label>Posición</mat-label>
          <input matInput type="number" min="1" [attr.max]="servicio.secciones().length" data-campo="posicion"
                 [value]="posicion()" (input)="posicion.set($any($event.target).value)" />
          <mat-hint>De 1 a {{ servicio.secciones().length }}. También puedes arrastrar la sección en la rejilla.</mat-hint>
        </mat-form-field>
      }
    </app-dialogo-edicion>
    <app-confirmacion titulo="Restaurar estilo" [mensaje]="mensajeRestauracion()"
                      [abierta]="restauracion() !== null" (abiertaChange)="cerrarConfirmacion($event)"
                      (confirmar)="restaurar()" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-m);
    }
    .buscador {
      width: 14rem;
    }
    .vigente {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .medidor {
      display: inline-flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 11rem;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .barra-medidor {
      display: block;
      height: 0.375rem;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-surface-container-highest);
      overflow: hidden;
    }
    .relleno {
      display: block;
      height: 100%;
      background: var(--mat-sys-primary);
    }
    .medidor.cerca .relleno {
      background: var(--mat-sys-tertiary);
    }
    .medidor.excedido {
      color: var(--mat-sys-error);
      font-weight: 600;
    }
    .medidor.excedido .relleno {
      background: var(--mat-sys-error);
    }
    .asa {
      display: inline-flex;
      align-items: center;
      color: var(--mat-sys-on-surface-variant);
      cursor: grab;
    }
    .cdk-drag-preview {
      border-radius: var(--luxe-radio-tarjeta);
      box-shadow: var(--mat-sys-level3);
    }
    .cdk-drag-placeholder {
      opacity: 0.3;
    }
    .cdk-drag-animating {
      transition: transform 200ms ease;
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
  private readonly dialogos = inject(MatDialog);
  private readonly plantillaHistorial = viewChild.required<TemplateRef<unknown>>('plantillaHistorial');
  private referenciaHistorial: MatDialogRef<unknown> | null = null;

  protected readonly ayuda = AYUDA;
  protected readonly maximoTitulo = MAXIMO_TITULO;
  protected readonly columnas = ['version', 'fecha', 'autor', 'texto', 'acciones'];

  protected readonly motivo = signal<string | null>(null);
  protected readonly recordatorioEvals = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly restauracion = signal<Restauracion | null>(null);
  protected readonly versionAbierta = signal<number | null>(null);
  protected readonly busqueda = signal('');
  protected readonly cercaDelTope = computed(
    () => this.servicio.caracteresCompuestos() >= this.servicio.maximo() * FRACCION_DE_AVISO,
  );
  protected readonly excedido = computed(() => this.servicio.caracteresCompuestos() > this.servicio.maximo());
  protected readonly porcentaje = computed(() =>
    Math.min(100, (this.servicio.caracteresCompuestos() / Math.max(1, this.servicio.maximo())) * 100),
  );

  /** Las secciones que coinciden con la búsqueda por título o por texto. */
  protected readonly visibles = computed(() => {
    const consulta = this.busqueda().trim().toLowerCase();
    const secciones = this.servicio.secciones();
    if (consulta === '') return secciones;
    return secciones.filter((s) => s.titulo.toLowerCase().includes(consulta) || s.texto.toLowerCase().includes(consulta));
  });
  /** Con una lista filtrada el orden completo no se ve: arrastrar queda apagado hasta limpiar la búsqueda. */
  protected readonly reordenDeshabilitado = computed(() => this.ocupado() || this.busqueda().trim() !== '');

  protected readonly editando = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  protected readonly titulo = signal('');
  protected readonly texto = signal('');
  protected readonly posicion = signal('');
  private actualizadoDeLaSeccion = '';
  private tituloOriginal = '';
  private textoOriginal = '';
  private posicionOriginal = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.referenciaHistorial?.close());
    void this.cargar();
  }

  protected extracto(texto: string, largo = LARGO_EXTRACTO): string {
    return texto.length > largo ? `${texto.slice(0, largo)}…` : texto;
  }

  protected etiquetasDe(seccion: SeccionDelEstilo): readonly string[] {
    return [`${seccion.texto.length} caracteres`, ...(seccion.activo ? [] : ['Apagada'])];
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
    this.tituloOriginal = seccion.titulo;
    this.textoOriginal = seccion.texto;
    this.posicionOriginal = this.servicio.secciones().findIndex((s) => s.id === seccion.id) + 1;
    this.titulo.set(seccion.titulo);
    this.texto.set(seccion.texto);
    this.posicion.set(String(this.posicionOriginal));
    this.editando.set(true);
  }

  /** Lo que hace «Guardar» en la ventana; un rechazo deja la ventana abierta con el motivo del servidor. */
  protected readonly guardar = async (): Promise<void> => {
    const id = this.editandoId();
    try {
      if (id === null) await this.servicio.crear({ titulo: this.titulo(), texto: this.texto(), activo: true });
      else await this.guardarCambios(id);
    } catch (error) {
      if (id !== null && leerProblema(error).codigo === 'seccion-modificada') await this.alCambiarPorOtro(id);
      throw error;
    }
    this.recordatorioEvals.set(true);
    await this.cargar();
  };

  /** Edita el contenido solo si cambió y mueve la sección solo si cambió su posición. */
  private async guardarCambios(id: string): Promise<void> {
    if (this.titulo() !== this.tituloOriginal || this.texto() !== this.textoOriginal) {
      const guardada = await this.servicio.editar(id, {
        actualizado: this.actualizadoDeLaSeccion,
        titulo: this.titulo(),
        texto: this.texto(),
      });
      // Si mover la sección falla, reintentar reenvía el contenido con la marca nueva y no choca consigo mismo.
      this.actualizadoDeLaSeccion = guardada.actualizado;
      this.tituloOriginal = this.titulo();
      this.textoOriginal = this.texto();
    }
    const ids = this.servicio.secciones().map((s) => s.id);
    const destino = Math.min(ids.length, Math.max(1, Math.trunc(Number(this.posicion()) || this.posicionOriginal)));
    if (destino !== this.posicionOriginal) {
      moveItemInArray(ids, this.posicionOriginal - 1, destino - 1);
      await this.servicio.ordenar(ids);
      this.posicionOriginal = destino;
    }
  }

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

  /** Suelta una tarjeta en otra posición: se ve el orden nuevo al instante y se manda el orden completo. */
  protected async soltar(evento: CdkDragDrop<unknown>): Promise<void> {
    if (evento.previousIndex === evento.currentIndex || this.reordenDeshabilitado()) return;
    const ids = this.servicio.secciones().map((s) => s.id);
    moveItemInArray(ids, evento.previousIndex, evento.currentIndex);
    this.servicio.aplicarOrden(ids);
    await this.mutar(async () => {
      try {
        await this.servicio.ordenar(ids);
      } catch (error) {
        // La lista vuelve al orden del servidor sin retrasar el motivo del rechazo.
        void this.cargar();
        throw error;
      }
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

  protected abrirHistorial(): void {
    if (this.referenciaHistorial !== null) return;
    const referencia = this.dialogos.open(this.plantillaHistorial(), { width: '58rem', maxWidth: '94vw', autoFocus: 'first-tabbable' });
    this.referenciaHistorial = referencia;
    referencia.afterClosed().subscribe(() => {
      if (this.referenciaHistorial === referencia) this.referenciaHistorial = null;
      this.versionAbierta.set(null);
    });
  }

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
      this.referenciaHistorial?.close();
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
