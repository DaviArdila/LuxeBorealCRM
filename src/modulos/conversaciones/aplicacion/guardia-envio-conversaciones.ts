import { Inject, Injectable } from '@nestjs/common';
import type { GuardiaEnvioCanal } from '../../canales/index.js';
import { REPOSITORIO_CONVERSACION, type RepositorioConversacion } from '../puertos/repositorio-conversacion.js';

/**
 * Guardia de envío por paso (CNV9, D7 de la 07a): `canales` la consulta justo antes de publicar cada
 * mensaje que declaró `requiereEstado`. Relee `conversacion.estado` en ese instante — no el del
 * momento de encolar — y compara; así una conversación que pasa a `humano` entre dos pasos ya
 * encolados no recibe el segundo (R5 por paso, no por lote). Se registra en
 * `RegistroGuardiaEnvioCanal` desde `onModuleInit` de `ConversacionesModule`.
 */
@Injectable()
export class GuardiaEnvioConversaciones implements GuardiaEnvioCanal {
  constructor(@Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion) {}

  async puedeEnviar(idConversacion: string, requiereEstado: string): Promise<boolean> {
    const conversacion = await this.repositorio.obtenerPorId(idConversacion);
    return conversacion !== null && conversacion.estado === requiereEstado;
  }
}
