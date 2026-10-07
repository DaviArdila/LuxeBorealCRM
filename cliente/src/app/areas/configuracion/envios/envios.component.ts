import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { AvisoComponent } from '../../../compartido/aviso.component';
import { CabeceraPaginaComponent } from '../../../compartido/cabecera-pagina.component';
import { DialogoEdicionComponent } from '../../../compartido/dialogo-edicion.component';
import { leerProblema } from '../../../nucleo/problema';
import { EnviosServicio } from './envios.servicio';

const AYUDA =
  'El bot no dice el recargo ni calcula con él: es un dato interno para el total de la venta. ' +
  'El factor volumétrico sí entra en la cotización de envío.';

/** SHL11: el recargo de contra entrega y el factor volumétrico; se editan en una ventana y rigen desde el siguiente mensaje. */
@Component({
  selector: 'app-envios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EnviosServicio],
  imports: [AvisoComponent, CabeceraPaginaComponent, DialogoEdicionComponent, MatButton, MatCard, MatCardContent, MatCardHeader, MatCardTitle, MatFormField, MatHint, MatIcon, MatInput, MatLabel],
  template: `
    <app-cabecera-pagina titulo="Envíos" [ayuda]="ayuda" />
    @if (guardado()) {
      <app-aviso tipo="info" [flotante]="true" [descartable]="true" (descartar)="guardado.set(false)">
        Guardado: el cambio rige desde el siguiente mensaje del cliente.
      </app-aviso>
    }
    @if (motivo(); as texto) {
      <app-aviso tipo="error" [flotante]="true" [descartable]="true" (descartar)="motivo.set(null)">{{ texto }}</app-aviso>
    }
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title><h2 class="titulo-tarjeta">Valores vigentes</h2></mat-card-title>
      </mat-card-header>
      <mat-card-content class="contenido">
        <p class="valor">Recargo de contra entrega: <strong data-recargo>{{ servicio.envios()?.recargoContraentregaPct }} %</strong></p>
        <p class="valor">Factor volumétrico: <strong data-factor>{{ servicio.envios()?.factorVolumetrico }}</strong></p>
        <div class="acciones">
          <button mat-flat-button type="button" (click)="editar()">
            <mat-icon fontIcon="edit" aria-hidden="true" />Editar
          </button>
        </div>
      </mat-card-content>
    </mat-card>

    <app-dialogo-edicion titulo="Editar envíos" [(abierta)]="editando" [hayCambios]="true" [alGuardar]="guardar"
                         [mensajeDeError]="motivoDe">
      <mat-form-field appearance="outline">
        <mat-label>Recargo de contra entrega (%)</mat-label>
        <input matInput type="number" step="0.01" min="0" max="100" data-campo="recargo" [value]="recargo()"
               (input)="recargo.set($any($event.target).value)" />
        <mat-hint>De 0 a 100, con hasta dos decimales.</mat-hint>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Factor volumétrico</mat-label>
        <input matInput type="number" step="1" min="1" data-campo="factor" [value]="factor()"
               (input)="factor.set($any($event.target).value)" />
        <mat-hint>Entero positivo de hasta 100000.</mat-hint>
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
export class EnviosComponent {
  protected readonly ayuda = AYUDA;
  protected readonly servicio = inject(EnviosServicio);
  protected readonly motivo = signal<string | null>(null);
  protected readonly guardado = signal(false);
  protected readonly editando = signal(false);
  /** Lo escrito se conserva como texto: el servidor decide si es un número válido (un `422` no lo borra). */
  protected readonly recargo = signal('');
  protected readonly factor = signal('');

  constructor() {
    void this.cargar();
  }

  protected readonly motivoDe = (error: unknown): string => {
    const problema = leerProblema(error);
    return problema.motivo ?? problema.titulo;
  };

  protected editar(): void {
    this.recargo.set(String(this.servicio.envios()?.recargoContraentregaPct ?? ''));
    this.factor.set(String(this.servicio.envios()?.factorVolumetrico ?? ''));
    this.editando.set(true);
  }

  protected readonly guardar = async (): Promise<void> => {
    await this.servicio.guardar(Number(this.recargo()), Number(this.factor()));
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
