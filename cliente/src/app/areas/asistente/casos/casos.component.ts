import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { AvisoComponent } from '../../../compartido/aviso.component';
import { ConfirmacionComponent } from '../../../compartido/confirmacion.component';
import { DialogoEdicionComponent } from '../../../compartido/dialogo-edicion.component';
import { EditorConContadorComponent } from '../../../compartido/editor-con-contador.component';
import { leerProblema } from '../../../nucleo/problema';
import { CasosServicio, type Caso, type CategoriaDeCasos, type FiltrosDeCasos } from './casos.servicio';

/** Topes que muestran los contadores; la regla de validez es del servidor (CAS5). */
const MAXIMO_TITULO = 80;
const MAXIMO_CUANDO_APLICA = 200;
const MAXIMO_DESCRIPCION_EVENTO = 1000;
const MAXIMO_TEXTO = 1200;
const RETARDO_BUSQUEDA_MS = 300;
const LARGO_EXTRACTO = 160;

type Tipo = '' | 'evento' | 'intencion';
type Modo = 'literal' | 'guia';

interface Grupo {
  readonly id: string;
  readonly nombre: string;
  readonly casos: readonly Caso[];
}

/** SHL10: los casos del asistente por categoría, con buscador, filtros, ventana de edición y gestión de categorías. */
@Component({
  selector: 'app-casos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CasosServicio],
  imports: [
    AvisoComponent,
    ConfirmacionComponent,
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
    MatOption,
    MatSelect,
    MatSlideToggle,
  ],
  template: `
    <h1>Casos de uso</h1>
    <app-aviso tipo="info">
      Aquí se editan las respuestas del bot por situación. Cómo habla el bot se edita en «Estilo del bot».
    </app-aviso>
    @if (motivo(); as texto) {
      <app-aviso tipo="error">{{ texto }}</app-aviso>
    }

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
      <mat-card appearance="outlined" data-vacio>
        <mat-card-content class="vacio">
          @if (hayFiltros()) {
            <p>Ningún caso coincide con la búsqueda.</p>
          } @else {
            <p>No hay casos todavía. Crea el primero para que el bot sepa qué responder.</p>
            <button mat-flat-button type="button" (click)="nuevoCaso()">
              <mat-icon fontIcon="add" aria-hidden="true" />Nuevo caso
            </button>
          }
        </mat-card-content>
      </mat-card>
    }

    @for (grupo of grupos(); track grupo.id) {
      <mat-card appearance="outlined" data-categoria>
        <mat-card-header>
          <mat-card-title><h2 class="titulo-tarjeta">{{ grupo.nombre }} ({{ grupo.casos.length }})</h2></mat-card-title>
        </mat-card-header>
        <mat-card-content class="casos">
          @for (caso of grupo.casos; track caso.id) {
            <div class="caso" data-caso [class.inactivo]="!caso.activo">
              <div class="cabecera">
                <strong>{{ caso.titulo }}</strong>
                <mat-chip-set aria-label="Etiquetas del caso">
                  @if (esDelSistema(caso)) { <mat-chip>Sistema</mat-chip> }
                  @if (!caso.activo) { <mat-chip>Inactivo</mat-chip> }
                  @if (caso.modo === 'guia') { <mat-chip>Guía</mat-chip> }
                </mat-chip-set>
                <span class="acciones-fila">
                  <button mat-icon-button type="button" [attr.aria-label]="'Editar ' + caso.titulo" (click)="editarCaso(caso)">
                    <mat-icon fontIcon="edit" aria-hidden="true" />
                  </button>
                  @if (!esDelSistema(caso)) {
                    <button mat-icon-button type="button" [attr.aria-label]="'Borrar ' + caso.titulo" (click)="borrando.set(caso)">
                      <mat-icon fontIcon="delete" aria-hidden="true" />
                    </button>
                  }
                </span>
              </div>
              <p class="cuando">{{ caso.cuandoAplica }}</p>
              <p class="texto">{{ extracto(caso.texto) }}</p>
            </div>
          }
        </mat-card-content>
      </mat-card>
    }

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title><h2 class="titulo-tarjeta">Categorías</h2></mat-card-title>
      </mat-card-header>
      <mat-card-content class="categorias" data-categorias>
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
        <div class="acciones">
          <button mat-stroked-button type="button" (click)="nuevaCategoria()">
            <mat-icon fontIcon="create_new_folder" aria-hidden="true" />Nueva categoría
          </button>
        </div>
      </mat-card-content>
    </mat-card>

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
      gap: 1rem;
    }
    h1,
    .titulo-tarjeta {
      margin: 0;
    }
    .titulo-tarjeta {
      font-size: inherit;
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
    }
    .vacio p {
      margin: 0;
    }
    .casos,
    .categorias {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .caso {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-block: 0.5rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .caso.inactivo {
      opacity: 0.6;
    }
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .acciones-fila {
      display: flex;
      gap: 0.25rem;
      margin-inline-start: auto;
    }
    .cuando {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .texto {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .categoria {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .cuenta {
      color: var(--mat-sys-on-surface-variant);
    }
    .acciones {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class CasosComponent {
  protected readonly servicio = inject(CasosServicio);
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

  /** Las categorías en su orden con sus casos; con filtros solo las que tienen casos que mostrar. */
  protected readonly grupos = computed<readonly Grupo[]>(() => {
    const casos = this.servicio.casos();
    const grupos = this.servicio
      .categorias()
      .map((categoria) => ({ id: categoria.id, nombre: categoria.nombre, casos: casos.filter((c) => c.categoriaId === categoria.id) }));
    return this.hayFiltros() ? grupos.filter((grupo) => grupo.casos.length > 0) : grupos;
  });

  protected readonly editandoCaso = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  private actualizadoDelCaso = '';
  private claveDelCaso: string | null = null;
  private eventoDelCaso = false;
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
    inject(DestroyRef).onDestroy(() => clearTimeout(this.temporizador));
    void this.recargar();
  }

  protected esDelSistema(caso: Caso): boolean {
    return caso.claveSistema !== null || caso.disparador === 'evento';
  }

  protected extracto(texto: string): string {
    return texto.length > LARGO_EXTRACTO ? `${texto.slice(0, LARGO_EXTRACTO)}…` : texto;
  }

  protected readonly motivoDe = (error: unknown): string => {
    const problema = leerProblema(error);
    return problema.motivo ?? problema.titulo;
  };

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
    this.claveDelCaso = caso.claveSistema;
    this.eventoDelCaso = caso.disparador === 'evento';
    this.soloTexto.set(this.esDelSistema(caso));
    this.eventoDelCasoSignal.set(this.eventoDelCaso);
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
