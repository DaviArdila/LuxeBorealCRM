import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { AvisoComponent } from '../../../compartido/aviso.component';
import { CabeceraPaginaComponent } from '../../../compartido/cabecera-pagina.component';
import { ConfirmacionComponent } from '../../../compartido/confirmacion.component';
import { DialogoEdicionComponent } from '../../../compartido/dialogo-edicion.component';
import { RejillaComponent } from '../../../compartido/rejilla.component';
import { leerProblema } from '../../../nucleo/problema';
import { type Dia, type DiasDelHorario, HorarioServicio } from './horario.servicio';

const NOMBRES: Readonly<Record<Dia, string>> = {
  lun: 'Lunes',
  mar: 'Martes',
  mie: 'Miércoles',
  jue: 'Jueves',
  vie: 'Viernes',
  sab: 'Sábado',
  dom: 'Domingo',
};
const ORDEN: readonly Dia[] = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

const AYUDA =
  'Fuera de este horario el bot avisa que un asesor responderá cuando abra. Las excepciones cierran un día completo.';

interface DiaEditable {
  readonly dia: Dia;
  readonly nombre: string;
  readonly abierto: boolean;
  readonly desde: string;
  readonly hasta: string;
}

/** SHL11: el horario por día y sus excepciones; se edita en una ventana y lo guardado rige desde el siguiente mensaje. */
@Component({
  selector: 'app-horario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [HorarioServicio],
  imports: [
    AvisoComponent,
    CabeceraPaginaComponent,
    ConfirmacionComponent,
    DialogoEdicionComponent,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardTitle,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatSlideToggle,
    RejillaComponent,
  ],
  template: `
    <app-cabecera-pagina titulo="Horario de atención" [ayuda]="ayuda" />
    @if (guardado()) {
      <app-aviso tipo="info" [flotante]="true" [descartable]="true" (descartar)="guardado.set(false)">
        Guardado: el cambio rige desde el siguiente mensaje del cliente.
      </app-aviso>
    }
    @if (motivo(); as texto) {
      <app-aviso tipo="error" [flotante]="true" [descartable]="true" (descartar)="motivo.set(null)">{{ texto }}</app-aviso>
    }
    <app-rejilla minimo="26rem">
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title><h2 class="titulo-tarjeta">Horario por día</h2></mat-card-title>
      </mat-card-header>
      <mat-card-content class="contenido">
        @for (fila of filas(); track fila.dia) {
          <div class="dia" data-dia>
            <strong>{{ fila.nombre }}</strong>
            <span>{{ fila.abierto ? fila.desde + ' – ' + fila.hasta : 'Cerrado' }}</span>
          </div>
        }
        <div class="acciones">
          <button mat-flat-button type="button" (click)="editar()">
            <mat-icon fontIcon="edit" aria-hidden="true" />Editar horario
          </button>
        </div>
      </mat-card-content>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title><h2 class="titulo-tarjeta">Excepciones</h2></mat-card-title>
      </mat-card-header>
      <mat-card-content class="contenido" data-excepciones>
        @for (excepcion of servicio.horario()?.excepciones ?? []; track excepcion.fecha) {
          <div class="dia">
            <span><strong>{{ excepcion.fecha }}</strong> {{ excepcion.motivo }}</span>
            <button mat-icon-button type="button" [attr.aria-label]="'Quitar excepción ' + excepcion.fecha"
                    (click)="quitando.set(excepcion.fecha)">
              <mat-icon fontIcon="delete" aria-hidden="true" />
            </button>
          </div>
        } @empty {
          <p class="vacio">No hay excepciones: se aplica el horario de cada día.</p>
        }
        <div class="acciones">
          <button mat-stroked-button type="button" (click)="nuevaExcepcion()">
            <mat-icon fontIcon="event_busy" aria-hidden="true" />Agregar excepción
          </button>
        </div>
      </mat-card-content>
    </mat-card>
    </app-rejilla>

    <app-dialogo-edicion titulo="Editar horario" [(abierta)]="editando" [hayCambios]="true" [alGuardar]="guardar"
                         [mensajeDeError]="motivoDe">
      @for (fila of borrador(); track fila.dia) {
        <div class="edicion">
          <mat-slide-toggle [attr.data-campo]="fila.dia + '-abierto'" [checked]="fila.abierto"
                            (change)="cambiar(fila.dia, { abierto: $event.checked })">{{ fila.nombre }}</mat-slide-toggle>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Desde</mat-label>
            <input matInput type="time" [attr.data-campo]="fila.dia + '-desde'" [value]="fila.desde" [disabled]="!fila.abierto"
                   (input)="cambiar(fila.dia, { desde: $any($event.target).value })" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Hasta</mat-label>
            <input matInput type="time" [attr.data-campo]="fila.dia + '-hasta'" [value]="fila.hasta" [disabled]="!fila.abierto"
                   (input)="cambiar(fila.dia, { hasta: $any($event.target).value })" />
          </mat-form-field>
        </div>
      }
    </app-dialogo-edicion>

    <app-dialogo-edicion titulo="Agregar excepción" [(abierta)]="agregando" [hayCambios]="true" [alGuardar]="guardarExcepcion"
                         [mensajeDeError]="motivoDe">
      <mat-form-field appearance="outline">
        <mat-label>Fecha</mat-label>
        <input matInput type="date" data-campo="excepcion-fecha" [value]="fecha()" (input)="fecha.set($any($event.target).value)" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Motivo (opcional)</mat-label>
        <input matInput data-campo="excepcion-motivo" [value]="motivoExcepcion()"
               (input)="motivoExcepcion.set($any($event.target).value)" />
      </mat-form-field>
    </app-dialogo-edicion>

    <app-confirmacion titulo="Quitar excepción" [mensaje]="'¿Quitar la excepción del ' + (quitando() ?? '') + '?'"
                      [abierta]="quitando() !== null" (abiertaChange)="cerrarQuitar($event)" (confirmar)="quitar()" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-m);
    }
    .titulo-tarjeta {
      margin: 0;
    }
    .titulo-tarjeta {
      font-size: inherit;
    }
    .contenido {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .dia {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      padding-block: 0.25rem;
    }
    .vacio {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .acciones {
      display: flex;
      justify-content: flex-end;
    }
    .edicion {
      display: grid;
      grid-template-columns: minmax(8rem, 1fr) 1fr 1fr;
      gap: 0.75rem;
      align-items: center;
    }
    @media (max-width: 640px) {
      .edicion {
        grid-template-columns: 1fr 1fr;
      }
      .edicion mat-slide-toggle {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class HorarioComponent {
  protected readonly ayuda = AYUDA;
  protected readonly servicio = inject(HorarioServicio);
  protected readonly motivo = signal<string | null>(null);
  protected readonly guardado = signal(false);

  protected readonly editando = signal(false);
  protected readonly borrador = signal<readonly DiaEditable[]>([]);

  protected readonly agregando = signal(false);
  protected readonly fecha = signal('');
  protected readonly motivoExcepcion = signal('');
  protected readonly quitando = signal<string | null>(null);

  constructor() {
    void this.cargar();
  }

  protected filas(): readonly DiaEditable[] {
    return this.aFilas(this.servicio.horario()?.dias);
  }

  private aFilas(dias: DiasDelHorario | undefined): readonly DiaEditable[] {
    return ORDEN.map((dia) => {
      const rango = dias?.[dia] ?? null;
      return { dia, nombre: NOMBRES[dia], abierto: rango !== null, desde: rango?.desde ?? '08:00', hasta: rango?.hasta ?? '18:00' };
    });
  }

  protected readonly motivoDe = (error: unknown): string => {
    const problema = leerProblema(error);
    return problema.motivo ?? problema.titulo;
  };

  protected editar(): void {
    this.borrador.set(this.filas());
    this.editando.set(true);
  }

  protected cambiar(dia: Dia, cambios: Partial<Pick<DiaEditable, 'abierto' | 'desde' | 'hasta'>>): void {
    this.borrador.update((filas) => filas.map((fila) => (fila.dia === dia ? { ...fila, ...cambios } : fila)));
  }

  /** Lo que hace «Guardar»: manda los siete días; un `422` deja la ventana abierta con el motivo y lo escrito. */
  protected readonly guardar = async (): Promise<void> => {
    const dias = Object.fromEntries(
      this.borrador().map((fila) => [fila.dia, fila.abierto ? { desde: fila.desde, hasta: fila.hasta } : null]),
    ) as DiasDelHorario;
    await this.servicio.guardar(dias);
    this.guardado.set(true);
  };

  protected nuevaExcepcion(): void {
    this.fecha.set('');
    this.motivoExcepcion.set('');
    this.agregando.set(true);
  }

  protected readonly guardarExcepcion = async (): Promise<void> => {
    const motivo = this.motivoExcepcion().trim();
    await this.servicio.agregarExcepcion(this.fecha(), motivo === '' ? null : motivo);
    this.guardado.set(true);
  };

  protected cerrarQuitar(abierta: boolean): void {
    if (!abierta) this.quitando.set(null);
  }

  protected async quitar(): Promise<void> {
    const fecha = this.quitando();
    if (fecha === null) return;
    this.motivo.set(null);
    try {
      await this.servicio.quitarExcepcion(fecha);
      this.guardado.set(true);
    } catch (error) {
      this.motivo.set(this.motivoDe(error));
    }
  }

  private async cargar(): Promise<void> {
    try {
      await this.servicio.cargar();
    } catch (error) {
      this.motivo.set(this.motivoDe(error));
    }
  }
}
