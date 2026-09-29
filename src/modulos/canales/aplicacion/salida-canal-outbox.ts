/**
 * Implementación de `SalidaCanal` (D9 de `design.md`) sobre el outbox genérico de plataforma
 * (D10): cada operación construye su clave de idempotencia con `dominio/claves-idempotencia.ts`
 * (D11) y encola una o más filas en `REGISTRO_OUTBOX.agregar` — nunca llama HTTP directamente.
 * `PublicarEfectoCanal` (`publicar-efecto-canal.ts`, T7) es el manejador registrado para los tres
 * `tipo` que esta clase produce; ambos archivos comparten los nombres de `tipo` exportados aquí
 * para que no puedan desalinearse.
 */
import { Inject, Injectable } from '@nestjs/common';
import { REGISTRO_OUTBOX, type NuevaEntradaOutbox, type RegistroOutbox } from '../../../plataforma/outbox/index.js';
import {
  MAX_PASOS_SECUENCIA,
  claveEstado,
  claveEtiquetas,
  claveMensaje,
  grupoConversacion,
} from '../dominio/claves-idempotencia.js';
import type {
  SalidaCanal,
  SolicitudCambioEstado,
  SolicitudEnvioMensajes,
  SolicitudEtiquetas,
} from '../puertos/salida-canal.js';

/** `tipo` de outbox de cada efecto de `canales` (D10); `PublicarEfectoCanal` los registra 1:1. */
export const TIPO_OUTBOX_MENSAJE = 'canal.mensaje';
export const TIPO_OUTBOX_ESTADO = 'canal.estado';
export const TIPO_OUTBOX_ETIQUETAS = 'canal.etiquetas';

@Injectable()
export class SalidaCanalOutbox implements SalidaCanal {
  constructor(@Inject(REGISTRO_OUTBOX) private readonly registroOutbox: RegistroOutbox) {}

  async enviarMensajes(solicitud: SolicitudEnvioMensajes): Promise<void> {
    const total = solicitud.mensajes.length;
    if (total === 0 || total > MAX_PASOS_SECUENCIA) {
      throw new Error(
        `SolicitudEnvioMensajes.mensajes debe tener entre 1 y ${MAX_PASOS_SECUENCIA} mensajes (recibidos: ${total}).`,
      );
    }

    const grupo = grupoConversacion(solicitud.idConversacion);
    const entradas: NuevaEntradaOutbox[] = solicitud.mensajes.map((mensaje, paso) => ({
      tipo: TIPO_OUTBOX_MENSAJE,
      claveIdempotencia: claveMensaje(solicitud.idConversacion, solicitud.idRespuesta, paso),
      grupo,
      orden: paso,
      datos: {
        idConversacion: solicitud.idConversacion,
        secuencia: solicitud.idRespuesta,
        paso,
        total,
        // Opaco para `canales`: solo la guardia registrada sabe leerlo (CAN9).
        ...(solicitud.requiereEstado === undefined ? {} : { requiereEstado: solicitud.requiereEstado }),
      },
      efimero: { texto: mensaje.texto },
    }));

    await this.registroOutbox.agregar(entradas);
  }

  async cambiarEstado(solicitud: SolicitudCambioEstado): Promise<void> {
    await this.registroOutbox.agregar([
      {
        tipo: TIPO_OUTBOX_ESTADO,
        claveIdempotencia: claveEstado(solicitud.idConversacion, solicitud.idOperacion),
        grupo: grupoConversacion(solicitud.idConversacion),
        orden: 0,
        datos: { idConversacion: solicitud.idConversacion, estado: solicitud.estado },
      },
    ]);
  }

  async agregarEtiquetas(solicitud: SolicitudEtiquetas): Promise<void> {
    await this.registroOutbox.agregar([
      {
        tipo: TIPO_OUTBOX_ETIQUETAS,
        claveIdempotencia: claveEtiquetas(solicitud.idConversacion, solicitud.idOperacion),
        grupo: grupoConversacion(solicitud.idConversacion),
        orden: 0,
        datos: { idConversacion: solicitud.idConversacion, etiquetas: solicitud.etiquetas },
      },
    ]);
  }
}
