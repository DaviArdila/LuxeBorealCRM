import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, type MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { AvisoComponent } from '../../../compartido/aviso.component';
import { CabeceraPaginaComponent } from '../../../compartido/cabecera-pagina.component';
import { ConfirmacionComponent } from '../../../compartido/confirmacion.component';
import { DialogoEdicionComponent } from '../../../compartido/dialogo-edicion.component';
import { EditorConContadorComponent } from '../../../compartido/editor-con-contador.component';
import { RejillaComponent } from '../../../compartido/rejilla.component';
import { TarjetaElementoComponent } from '../../../compartido/tarjeta-elemento.component';
import { leerProblema } from '../../../nucleo/problema';
import { CasosServicio, type Caso, type CategoriaDeCasos, type FiltrosDeCasos } from './casos.servicio';

/** Topes que muestran los contadores; la regla de validez es del servidor (CAS5). */
const MAXIMO_TITULO = 80;
const MAXIMO_CUANDO_APLICA = 200;
const MAXIMO_DESCRIPCION_EVENTO = 1000;
const MAXIMO_TEXTO = 1200;
const RETARDO_BUSQUEDA_MS = 300;
const LARGO_EXTRACTO = 160;
/** Cuántos títulos de vista previa muestra la ficha de una categoría. */
const TITULOS_EN_FICHA = 3;
const AYUDA =
  'Aquí se editan las respuestas del bot por situación. Cómo habla el bot se edita en «Estilo del bot».';

type Tipo = '' | 'evento' | 'intencion';
type Modo = 'literal' | 'guia';

interface Grupo {
  readonly id: string;
  readonly nombre: string;
  readonly casos: readonly Caso[];
}

/**
 * SHL10: los casos del asistente. La vista principal es una rejilla de categorías; una categoría abre una ventana
 * con las tarjetas de sus casos, un caso abre su lectura completa y desde ahí se edita (ventana de edición
 * anidada). La gestión de categorías vive en una ventana propia que abre el botón «Categorías» de la cabecera.
 */
@Component({
  selector: 'app-casos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CasosServicio],
  imports: [
    AvisoComponent,
    CabeceraPaginaComponent,
    ConfirmacionComponent,
    DialogoEdicionComponent,
    EditorConContadorComponent,
    MatButton,
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
    MatOption,
    MatSelect,
    MatSlideToggle,
    RejillaComponent,
    TarjetaElementoComponent,
  ],
  template: `
    <app-cabecera-pagina titulo="Casos de uso" [ayuda]="ayuda">
      <button mat-stroked-button type="button" data-accion="categorias" (click)="abrirGestor()">
        <mat-icon fontIcon="category" aria-hidden="true" />Categorías
      </button>
      @if (motivo(); as texto) {
        <app-aviso tipo="error" [flotante]="true" [descartable]="true" (descartar)="motivo.set(null)">{{ texto }}</app-aviso>
      }
    </app-cabecera-pagina>

    <div class="barra">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="buscador">
        <mat-label>Buscar</mat-label>
        <input matInput type="search" data-campo="buscar" [value]="busqueda()"
               (input)="alBuscar($any($event.target).value)" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Categoría</mat-label>
        <mat-select [value]="categoriaFiltro()" (selectionChange)="filtrarPorCategoria($event.value)">
          <mat-option value="">Todas</mat-option>
          @for (categoria of servicio.categorias(); track categoria.id) {
            <mat-option [value]="categoria.id">{{ categoria.nombre }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Tipo</mat-label>
        <mat-select [value]="tipoFiltro()" (selectionChange)="filtrarPorTipo($event.value)">
          <mat-option value="">Todos</mat-option>
          <mat-option value="evento">Del sistema (por evento)</mat-option>
          <mat-option value="intencion">Por intención</mat-option>
        </mat-select>
      </mat-form-field>
      <button mat-flat-button type="button" (click)="nuevoCaso()">
        <mat-icon fontIcon="add" aria-hidden="true" />Nuevo caso
      </button>
    </div>

    @if (servicio.casos().length === 0) {
      <div class="vacio" data-vacio>
        @if (hayFiltros()) {
          <p>Ningún caso coincide con la búsqueda.</p>
        } @else {
          <p>No hay casos todavía. Crea el primero para que el bot sepa qué responder.</p>
          <button mat-flat-button type="button" (click)="nuevoCaso()">
            <mat-icon fontIcon="add" aria-hidden="true" />Nuevo caso
          </button>
        }
      </div>
    }

    <app-rejilla>
      @for (grupo of grupos(); track grupo.id) {
        <app-tarjeta-elemento data-categoria variante="categoria" [titulo]="grupo.nombre" [conteo]="grupo.casos.length"
          [titulos]="titulosDe(grupo)" [etiquetas]="grupo.casos.some(inactivo) ? ['Con inactivos'] : []" [clicable]="true"
          (abrir)="abrirCategoria(grupo.id)" />
      }
    </app-rejilla>

    <ng-template #plantillaCategoria>
      @if (categoriaAbierta(); as grupo) {
        <h2 mat-dialog-title>{{ grupo.nombre }} ({{ grupo.casos.length }})</h2>
        <mat-dialog-content>
          @if (grupo.casos.length === 0) {
            <p>Esta categoría no tiene casos todavía.</p>
          }
          <app-rejilla minimo="19rem">
            @for (caso of grupo.casos; track caso.id) {
              <app-tarjeta-elemento data-caso [titulo]="caso.titulo" [etiquetas]="etiquetasDe(caso)"
                [vista]="caso.cuandoAplica" [atenuada]="!caso.activo" [clicable]="true" (abrir)="leer(caso)">
                <p class="extracto">{{ extracto(caso.texto) }}</p>
                <span acciones>
                  <button mat-icon-button type="button" [attr.aria-label]="'Editar ' + caso.titulo" (click)="editarCaso(caso)">
                    <mat-icon fontIcon="edit" aria-hidden="true" />
                  </button>
                  @if (!esDelSistema(caso)) {
                    <button mat-icon-button type="button" [attr.aria-label]="'Borrar ' + caso.titulo" (click)="borrando.set(caso)">
                      <mat-icon fontIcon="delete" aria-hidden="true" />
                    </button>
                  }
                </span>
              </app-tarjeta-elemento>
            }
          </app-rejilla>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>Cerrar</button>
        </mat-dialog-actions>
      }
    </ng-template>

    <ng-template #plantillaLectura>
      @if (casoLeido(); as caso) {
        <h2 mat-dialog-title>{{ caso.titulo }}</h2>
        <mat-dialog-content>
          <div class="lectura" data-lectura>
            <p class="etiquetas-lectura">{{ etiquetasDe(caso).join(' · ') }}</p>
            <h3>Cuándo aplica</h3>
            <p>{{ caso.cuandoAplica }}</p>
            <h3>Texto</h3>
            <p class="texto">{{ caso.texto }}</p>
          </div>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>Cerrar</button>
          <button mat-flat-button type="button" (click)="editarCaso(caso)">
            <mat-icon fontIcon="edit" aria-hidden="true" />Editar
          </button>
        </mat-dialog-actions>
      }
    </ng-template>

    <ng-template #plantillaGestor>
      <h2 mat-dialog-title>Categorías</h2>
      <mat-dialog-content>
        @if (motivo(); as texto) {
          <app-aviso tipo="error">{{ texto }}</app-aviso>
        }
        <div class="categorias" data-categorias>
          @for (categoria of servicio.categorias(); track categoria.id; let primera = $first; let ultima = $last) {
            <div class="categoria">
              <span class="nombre">{{ categoria.nombre }} <span class="cuenta">({{ categoria.totalCasos }})</span></span>
              <span class="acciones-fila">
                <button mat-icon-button type="button" [disabled]="primera || ocupado()"
                        [attr.aria-label]="'Subir categoría ' + categoria.nombre" (click)="mover(categoria, -1)">
                  <mat-icon fontIcon="arrow_upward" aria-hidden="true" />
                </button>
                <button mat-icon-button type="button" [disabled]="ultima || ocupado()"
                        [attr.aria-label]="'Bajar categoría ' + categoria.nombre" (click)="mover(categoria, 1)">
                  <mat-icon fontIcon="arrow_downward" aria-hidden="true" />
                </button>
                <button mat-icon-button type="button" [attr.aria-label]="'Renombrar categoría ' + categoria.nombre"
                        (click)="renombrarCategoria(categoria)">
                  <mat-icon fontIcon="edit" aria-hidden="true" />
                </button>
                <button mat-icon-button type="button" [attr.aria-label]="'Borrar categoría ' + categoria.nombre"
                        (click)="borrandoCategoria.set(categoria)">
                  <mat-icon fontIcon="delete" aria-hidden="true" />
                </button>
              </span>
            </div>
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cerrar</button>
        <button mat-stroked-button type="button" (click)="nuevaCategoria()">
          <mat-icon fontIcon="create_new_folder" aria-hidden="true" />Nueva categoría
        </button>
      </mat-dialog-actions>
    </ng-template>

    <app-dialogo-edicion [titulo]="editandoId() === null ? 'Nuevo caso' : 'Editar caso'" [(abierta)]="editandoCaso"
                         [hayCambios]="true" [alGuardar]="guardarCaso" [mensajeDeError]="motivoDe">
      <mat-form-field appearance="outline">
        <mat-label>Categoría</mat-label>
        <mat-select [(value)]="formulario.categoriaId">
          @for (categoria of servicio.categorias(); track categoria.id) {
            <mat-option [value]="categoria.id">{{ categoria.nombre }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Título</mat-label>
        <input matInput data-campo="titulo" [value]="formulario.titulo()" [disabled]="soloTexto()"
               (input)="formulario.titulo.set($any($event.target).value)" />
        <mat-hint align="end">{{ formulario.titulo().length }} / {{ maximoTitulo }}</mat-hint>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Cuándo aplica</mat-label>
        <textarea matInput rows="3" data-campo="cuando-aplica" [value]="formulario.cuandoAplica()" [disabled]="soloTexto()"
                  (input)="formulario.cuandoAplica.set($any($event.target).value)"></textarea>
        <mat-hint align="end">{{ formulario.cuandoAplica().length }} / {{ maximoCuandoAplica() }}</mat-hint>
      </mat-form-field>
      <app-editor-con-contador etiqueta="Texto" campo="texto" [filas]="6" [maximo]="maximoTexto"
                               [(texto)]="formulario.texto" />
      @if (!soloTexto()) {
        <mat-form-field appearance="outline">
          <mat-label>Modo</mat-label>
          <mat-select [(value)]="formulario.modo">
            <mat-option value="literal">Literal: el bot lo cita palabra por palabra</mat-option>
            <mat-option value="guia">Guía: el bot lo usa como base y lo redacta</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-slide-toggle data-campo="activo" [checked]="formulario.activo()"
                          (change)="formulario.activo.set($event.checked)">
          Activo (el bot puede usarlo)
        </mat-slide-toggle>
      }
    </app-dialogo-edicion>

    <app-dialogo-edicion [titulo]="categoriaEditada() === null ? 'Nueva categoría' : 'Renombrar categoría'"
                         [(abierta)]="editandoCategoria" [hayCambios]="true" [alGuardar]="guardarCategoria"
                         [mensajeDeError]="motivoDe">
      <mat-form-field appearance="outline">
        <mat-label>Nombre</mat-label>
        <input matInput data-campo="nombre-categoria" [value]="nombreCategoria()"
               (input)="nombreCategoria.set($any($event.target).value)" />
      </mat-form-field>
    </app-dialogo-edicion>

    <app-confirmacion titulo="Borrar caso" [mensaje]="'¿Borrar el caso «' + (borrando()?.titulo ?? '') + '»?'"
                      [abierta]="borrando() !== null" (abiertaChange)="cerrarBorrado($event)" (confirmar)="borrar()" />
    <app-confirmacion titulo="Borrar categoría"
                      [mensaje]="'¿Borrar la categoría «' + (borrandoCategoria()?.nombre ?? '') + '»?'"
                      [abierta]="borrandoCategoria() !== null" (abiertaChange)="cerrarBorradoCategoria($event)"
                      (confirmar)="borrarCategoria()" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-m);
    }
    .barra {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }
    .buscador {
      flex: 1 1 14rem;
    }
    .vacio {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
      padding: var(--luxe-espacio-m);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--luxe-radio-tarjeta);
    }
    .vacio p {
      margin: 0;
    }
    .extracto {
      margin: 0;
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
    .lectura h3 {
      margin: var(--luxe-espacio-m) 0 var(--luxe-espacio-xs);
      font: var(--mat-sys-title-small);
    }
    .lectura p {
      margin: 0;
    }
    .etiquetas-lectura {
      color: var(--mat-sys-on-surface-variant);
    }
    .texto {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .categorias {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .categoria {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .nombre {
      flex: 1;
    }
    .acciones-fila {
      display: flex;
      gap: 0.25rem;
    }
    .cuenta {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CasosComponent {
  protected readonly servicio = inject(CasosServicio);
  private readonly dialogos = inject(MatDialog);
  private readonly plantillaCategoria = viewChild.required<TemplateRef<unknown>>('plantillaCategoria');
  private readonly plantillaLectura = viewChild.required<TemplateRef<unknown>>('plantillaLectura');
  private readonly plantillaGestor = viewChild.required<TemplateRef<unknown>>('plantillaGestor');
  private readonly abiertos = new Set<MatDialogRef<unknown>>();

  protected readonly ayuda = AYUDA;
  protected readonly maximoTitulo = MAXIMO_TITULO;
  protected readonly maximoTexto = MAXIMO_TEXTO;

  protected readonly motivo = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly busqueda = signal('');
  protected readonly categoriaFiltro = signal('');
  protected readonly tipoFiltro = signal<Tipo>('');
  protected readonly hayFiltros = computed(
    () => this.busqueda().trim() !== '' || this.categoriaFiltro() !== '' || this.tipoFiltro() !== '',
  );

  /**
   * Las categorías en su orden con sus casos. Con filtros, solo las que tienen casos que mostrar o cuyo nombre
   * coincide con la búsqueda (el servidor filtra los casos; el nombre de la categoría se compara aquí).
   */
  protected readonly grupos = computed<readonly Grupo[]>(() => {
    const casos = this.servicio.casos();
    const consulta = this.busqueda().trim().toLowerCase();
    const delFiltro = this.categoriaFiltro();
    const grupos = this.servicio
      .categorias()
      .map((categoria) => ({ id: categoria.id, nombre: categoria.nombre, casos: casos.filter((c) => c.categoriaId === categoria.id) }));
    if (!this.hayFiltros()) return grupos;
    return grupos.filter(
      (grupo) =>
        (delFiltro === '' || grupo.id === delFiltro) &&
        (grupo.casos.length > 0 || (consulta !== '' && grupo.nombre.toLowerCase().includes(consulta))),
    );
  });

  protected readonly categoriaAbiertaId = signal<string | null>(null);
  protected readonly categoriaAbierta = computed(() => this.grupos().find((g) => g.id === this.categoriaAbiertaId()) ?? null);
  protected readonly casoLeidoId = signal<string | null>(null);
  protected readonly casoLeido = computed(() => this.servicio.casos().find((c) => c.id === this.casoLeidoId()) ?? null);

  protected readonly editandoCaso = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  private actualizadoDelCaso = '';
  /** Los campos del formulario del caso; `categoriaId` y `modo` van como propiedad porque `mat-select` los enlaza en doble vía. */
  protected readonly formulario = {
    categoriaId: signal(''),
    titulo: signal(''),
    cuandoAplica: signal(''),
    texto: signal(''),
    modo: signal<Modo>('literal'),
    activo: signal(true),
  };
  /** Un caso del sistema solo edita su texto (y su categoría): el resto lo define el código. */
  protected readonly soloTexto = signal(false);
  protected readonly maximoCuandoAplica = computed(() => (this.eventoDelCasoSignal() ? MAXIMO_DESCRIPCION_EVENTO : MAXIMO_CUANDO_APLICA));
  private readonly eventoDelCasoSignal = signal(false);

  protected readonly borrando = signal<Caso | null>(null);

  protected readonly editandoCategoria = signal(false);
  protected readonly categoriaEditada = signal<CategoriaDeCasos | null>(null);
  protected readonly nombreCategoria = signal('');
  protected readonly borrandoCategoria = signal<CategoriaDeCasos | null>(null);

  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.temporizador);
      for (const referencia of this.abiertos) referencia.close();
    });
    void this.recargar();
  }

  protected esDelSistema(caso: Caso): boolean {
    return caso.claveSistema !== null || caso.disparador === 'evento';
  }

  protected readonly inactivo = (caso: Caso): boolean => !caso.activo;

  protected etiquetasDe(caso: Caso): readonly string[] {
    return [
      ...(this.esDelSistema(caso) ? ['Sistema'] : []),
      ...(caso.activo ? [] : ['Inactivo']),
      ...(caso.modo === 'guia' ? ['Guía'] : []),
    ];
  }

  protected titulosDe(grupo: Grupo): readonly string[] {
    return grupo.casos.slice(0, TITULOS_EN_FICHA).map((caso) => caso.titulo);
  }

  protected extracto(texto: string): string {
    return texto.length > LARGO_EXTRACTO ? `${texto.slice(0, LARGO_EXTRACTO)}…` : texto;
  }

  protected readonly motivoDe = (error: unknown): string => {
    const problema = leerProblema(error);
    return problema.motivo ?? problema.titulo;
  };

  // --- Ventanas de lectura (categoría, caso y gestión de categorías) ---

  protected abrirCategoria(id: string): void {
    this.categoriaAbiertaId.set(id);
    this.abrirVentana(this.plantillaCategoria(), '64rem', () => this.categoriaAbiertaId.set(null));
  }

  protected leer(caso: Caso): void {
    this.casoLeidoId.set(caso.id);
    this.abrirVentana(this.plantillaLectura(), '44rem', () => this.casoLeidoId.set(null));
  }

  protected abrirGestor(): void {
    this.abrirVentana(this.plantillaGestor(), '36rem');
  }

  private abrirVentana(plantilla: TemplateRef<unknown>, ancho: string, alCerrar?: () => void): void {
    const referencia = this.dialogos.open(plantilla, { width: ancho, maxWidth: '94vw', autoFocus: 'first-tabbable' });
    this.abiertos.add(referencia);
    referencia.afterClosed().subscribe(() => {
      this.abiertos.delete(referencia);
      alCerrar?.();
    });
  }

  // --- Buscador y filtros: el servidor busca y filtra (CAS10) ---

  protected alBuscar(valor: string): void {
    this.busqueda.set(valor);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.buscar(), RETARDO_BUSQUEDA_MS);
  }

  protected filtrarPorCategoria(valor: string): void {
    this.categoriaFiltro.set(valor);
    void this.buscar();
  }

  protected filtrarPorTipo(valor: Tipo): void {
    this.tipoFiltro.set(valor);
    void this.buscar();
  }

  private filtros(): FiltrosDeCasos {
    const q = this.busqueda().trim();
    return {
      ...(q === '' ? {} : { q }),
      ...(this.categoriaFiltro() === '' ? {} : { categoriaId: this.categoriaFiltro() }),
      ...(this.tipoFiltro() === '' ? {} : { disparador: this.tipoFiltro() as 'evento' | 'intencion' }),
    };
  }

  private async buscar(): Promise<void> {
    await this.intentar(() => this.servicio.cargarCasos(this.filtros()));
  }

  private async recargar(): Promise<void> {
    await this.intentar(() => this.servicio.cargar(this.filtros()));
  }

  private async intentar(accion: () => Promise<void>): Promise<void> {
    this.motivo.set(null);
    try {
      await accion();
    } catch (error) {
      this.motivo.set(this.motivoDe(error));
    }
  }

  // --- Casos ---

  protected nuevoCaso(): void {
    const categoria = this.categoriaFiltro() || this.servicio.categorias()[0]?.id || '';
    this.editandoId.set(null);
    this.soloTexto.set(false);
    this.eventoDelCasoSignal.set(false);
    this.formulario.categoriaId.set(categoria);
    this.formulario.titulo.set('');
    this.formulario.cuandoAplica.set('');
    this.formulario.texto.set('');
    this.formulario.modo.set('literal');
    this.formulario.activo.set(true);
    this.editandoCaso.set(true);
  }

  protected editarCaso(caso: Caso): void {
    this.editandoId.set(caso.id);
    this.actualizadoDelCaso = caso.actualizado;
    this.soloTexto.set(this.esDelSistema(caso));
    this.eventoDelCasoSignal.set(caso.disparador === 'evento');
    this.formulario.categoriaId.set(caso.categoriaId);
    this.formulario.titulo.set(caso.titulo);
    this.formulario.cuandoAplica.set(caso.cuandoAplica);
    this.formulario.texto.set(caso.texto);
    this.formulario.modo.set(caso.modo);
    this.formulario.activo.set(caso.activo);
    this.editandoCaso.set(true);
  }

  /** Lo que hace «Guardar» en la ventana del caso; un rechazo deja la ventana abierta con el motivo del servidor. */
  protected readonly guardarCaso = async (): Promise<void> => {
    const f = this.formulario;
    const id = this.editandoId();
    if (id === null) {
      await this.servicio.crear({
        categoriaId: f.categoriaId(),
        titulo: f.titulo(),
        cuandoAplica: f.cuandoAplica(),
        texto: f.texto(),
        modo: f.modo(),
        activo: f.activo(),
      });
    } else if (this.soloTexto()) {
      await this.servicio.editar(id, { actualizado: this.actualizadoDelCaso, categoriaId: f.categoriaId(), texto: f.texto() });
    } else {
      await this.servicio.editar(id, {
        actualizado: this.actualizadoDelCaso,
        categoriaId: f.categoriaId(),
        titulo: f.titulo(),
        cuandoAplica: f.cuandoAplica(),
        texto: f.texto(),
        modo: f.modo(),
        activo: f.activo(),
      });
    }
    await this.recargar();
  };

  protected cerrarBorrado(abierta: boolean): void {
    if (!abierta) this.borrando.set(null);
  }

  protected async borrar(): Promise<void> {
    const caso = this.borrando();
    if (caso === null) return;
    await this.intentar(async () => {
      await this.servicio.borrar(caso.id);
      await this.servicio.cargar(this.filtros());
    });
  }

  // --- Categorías ---

  protected nuevaCategoria(): void {
    this.categoriaEditada.set(null);
    this.nombreCategoria.set('');
    this.editandoCategoria.set(true);
  }

  protected renombrarCategoria(categoria: CategoriaDeCasos): void {
    this.categoriaEditada.set(categoria);
    this.nombreCategoria.set(categoria.nombre);
    this.editandoCategoria.set(true);
  }

  protected readonly guardarCategoria = async (): Promise<void> => {
    const categoria = this.categoriaEditada();
    if (categoria === null) await this.servicio.crearCategoria(this.nombreCategoria());
    else await this.servicio.renombrarCategoria(categoria.id, this.nombreCategoria());
    await this.recargar();
  };

  /** Mueve la categoría una posición y manda el orden completo (CAS2). */
  protected async mover(categoria: CategoriaDeCasos, sentido: -1 | 1): Promise<void> {
    const ids = this.servicio.categorias().map((c) => c.id);
    const desde = ids.indexOf(categoria.id);
    const hacia = desde + sentido;
    if (hacia < 0 || hacia >= ids.length) return;
    [ids[desde], ids[hacia]] = [ids[hacia]!, ids[desde]!];
    this.ocupado.set(true);
    try {
      await this.intentar(() => this.servicio.ordenarCategorias(ids));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected cerrarBorradoCategoria(abierta: boolean): void {
    if (!abierta) this.borrandoCategoria.set(null);
  }

  /** Borra la categoría confirmada; si tiene casos el servidor lo rechaza y la pantalla muestra el motivo. */
  protected async borrarCategoria(): Promise<void> {
    const categoria = this.borrandoCategoria();
    if (categoria === null) return;
    await this.intentar(async () => {
      await this.servicio.borrarCategoria(categoria.id);
      await this.servicio.cargar(this.filtros());
    });
  }
}
