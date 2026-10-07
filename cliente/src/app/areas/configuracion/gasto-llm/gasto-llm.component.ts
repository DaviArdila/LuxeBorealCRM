import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { AvisoComponent } from '../../../compartido/aviso.component';
import { CabeceraPaginaComponent } from '../../../compartido/cabecera-pagina.component';
import { DialogoEdicionComponent } from '../../../compartido/dialogo-edicion.component';
import { RejillaComponent } from '../../../compartido/rejilla.component';
import { leerProblema } from '../../../nucleo/problema';
import { GastoLlmServicio } from './gasto-llm.servicio';

const AYUDA = 'El techo limita lo que el bot puede gastar en el LLM cada mes. El estado y el gasto del mes solo se leen.';

/** SHL11: el techo mensual del LLM es editable; su estado y el gasto del mes solo se leen. */
@Component({
  selector: 'app-gasto-llm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GastoLlmServicio],
  imports: [
    AvisoComponent,
    CabeceraPaginaComponent,
    DialogoEdicionComponent,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardTitle,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    RejillaComponent,
  ],
  template: `
    <app-cabecera-pagina titulo="Gasto del LLM" [ayuda]="ayuda" />
    @if (guardado()) {
      <app-aviso tipo="info" [flotante]="true" [descartable]="true" (descartar)="guardado.set(false)">
        Guardado: el techo rige desde el siguiente mensaje del cliente.
      </app-aviso>
    }
    @if (motivo(); as texto) {
      <app-aviso tipo="error" [flotante]="true" [descartable]="true" (descartar)="motivo.set(null)">{{ texto }}</app-aviso>
    }
    <app-rejilla minimo="26rem">
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title><h2 class="titulo-tarjeta">Techo mensual</h2></mat-card-title>
      </mat-card-header>
      <mat-card-content class="contenido">
        <p class="valor">
          Techo:
          <strong data-techo>
            @if (servicio.gasto()?.techoMensualUsd !== null && servicio.gasto()?.techoMensualUsd !== undefined) {
              {{ servicio.gasto()?.techoMensualUsd }} USD
            } @else {
              no configurado: rige el del entorno
            }
          </strong>
        </p>
        <div class="acciones">
          <button mat-flat-button type="button" (click)="editar()">
            <mat-icon fontIcon="edit" aria-hidden="true" />Editar techo
          </button>
        </div>
      </mat-card-content>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title><h2 class="titulo-tarjeta">Estado del mes (solo lectura)</h2></mat-card-title>
      </mat-card-header>
      <mat-card-content class="contenido">
        <p class="valor">Gasto del mes: <strong data-gasto>{{ servicio.gasto()?.gastoMesUsd ?? 'sin registro' }} @if (servicio.gasto()?.gastoMesUsd !== null) { USD }</strong></p>
        <p class="valor" data-estado>
          @if (servicio.gasto()?.estado; as estado) {
            Mes {{ estado.mes }}:
            @if (estado.bloqueado) { techo alcanzado, el bot no usa el LLM }
            @else if (estado.avisoEmitido) { Aviso del 80 % emitido }
            @else { dentro del techo }
          } @else {
            Todavía no hay estado del mes.
          }
        </p>
      </mat-card-content>
    </mat-card>
    </app-rejilla>

    <app-dialogo-edicion titulo="Editar techo mensual" [(abierta)]="editando" [hayCambios]="true" [alGuardar]="guardar"
                         [mensajeDeError]="motivoDe">
      <mat-form-field appearance="outline">
        <mat-label>Techo mensual (USD)</mat-label>
        <input matInput type="number" step="0.01" min="0" data-campo="techo" [value]="techo()"
               (input)="techo.set($any($event.target).value)" />
        <mat-hint>Mayor que 0 y de hasta 10000.</mat-hint>
      </mat-form-field>
    </app-dialogo-edicion>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--luxe-espacio-m);
    }
    .titulo-tarjeta,
    .valor {
      margin: 0;
    }
    .titulo-tarjeta {
      font-size: inherit;
    }
    .contenido {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .acciones {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class GastoLlmComponent {
  protected readonly ayuda = AYUDA;
  protected readonly servicio = inject(GastoLlmServicio);
  protected readonly motivo = signal<string | null>(null);
  protected readonly guardado = signal(false);
  protected readonly editando = signal(false);
  protected readonly techo = signal('');

  constructor() {
    void this.cargar();
  }

  protected readonly motivoDe = (error: unknown): string => {
    const problema = leerProblema(error);
    return problema.motivo ?? problema.titulo;
  };

  protected editar(): void {
    this.techo.set(String(this.servicio.gasto()?.techoMensualUsd ?? ''));
    this.editando.set(true);
  }

  protected readonly guardar = async (): Promise<void> => {
    await this.servicio.guardar(Number(this.techo()));
    this.guardado.set(true);
  };

  private async cargar(): Promise<void> {
    try {
      await this.servicio.cargar();
    } catch (error) {
      this.motivo.set(this.motivoDe(error));
    }
  }
}
