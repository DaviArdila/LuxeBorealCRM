import { Inject, Injectable } from '@nestjs/common';
import { REGISTRO_OUTBOX, type RegistroOutbox } from '../../../plataforma/outbox/index.js';
import { armarAviso, type DatosAviso } from '../dominio/armar-aviso.js';

/** Tipo de fila de outbox que entrega {@link PublicarNotificacionTelegram} (D9 de la Fase 08). */
export const TIPO_OUTBOX_NOTIFICACION_TELEGRAM = 'notificacion.telegram';

export interface EntradaAviso {
  /** Idempotencia de dominio (p. ej. `aviso:<leadId>`): reencolar el mismo aviso no lo duplica. */
  readonly claveIdempotencia: string;
  /** Las filas de un mismo grupo salen en orden estricto: un grupo por lead evita que uno bloquee a otro. */
  readonly grupo: string;
  readonly aviso: DatosAviso;
}

/**
 * Encola un aviso a los asesores en el outbox (NTF1, ADR-0004): nadie llama a Telegram de forma directa.
 * El texto va en `efimero`, así que se borra de la base al entregar (R14).
 */
@Injectable()
export class EncolarAviso {
  constructor(@Inject(REGISTRO_OUTBOX) private readonly outbox: RegistroOutbox) {}

  async ejecutar(entrada: EntradaAviso): Promise<void> {
    await this.outbox.agregar([
      {
        tipo: TIPO_OUTBOX_NOTIFICACION_TELEGRAM,
        claveIdempotencia: entrada.claveIdempotencia,
        grupo: entrada.grupo,
        orden: 0,
        datos: { tipo: entrada.aviso.tipo },
        efimero: { texto: armarAviso(entrada.aviso) },
      },
    ]);
  }
}
