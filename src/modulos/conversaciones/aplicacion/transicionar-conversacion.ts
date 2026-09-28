import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { calcularTransicion, type EstadoAtencion, type OrigenTransicion } from '../dominio/maquina-estados.js';
import {
  REPOSITORIO_CONVERSACION,
  type Conversacion,
  type RepositorioConversacion,
} from '../puertos/repositorio-conversacion.js';

/** Un segundo conflicto de versión sobre la misma fila: señal real, no algo para reintentar más (D2). */
export class ConflictoDeVersionPersistente extends Error {
  constructor(id: string) {
    super(`Conflicto de versión persistente al transicionar la conversación ${id} (D2).`);
    this.name = 'ConflictoDeVersionPersistente';
  }
}

/**
 * Orquesta D3 (dominio) + D2 (repositorio): calcula la transición sobre el estado recibido y la
 * persiste con bloqueo optimista. Ante un conflicto de versión (otra escritura ganó primero),
 * relee el estado fresco por id y **reintenta una sola vez**, recalculando la transición sobre ese
 * estado; un segundo conflicto propaga {@link ConflictoDeVersionPersistente} (D2: el lock de D7 ya
 * reduce la probabilidad de dos escritores concurrentes, así que un segundo conflicto es una señal,
 * no algo para reintentar indefinidamente).
 */
@Injectable()
export class TransicionarConversacion {
  constructor(
    @Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async ejecutar(
    conversacion: Conversacion,
    destino: EstadoAtencion,
    origen: OrigenTransicion,
  ): Promise<Conversacion> {
    const primerIntento = await this.intentar(conversacion, destino, origen);
    if (primerIntento !== null) return primerIntento;

    const fresca = await this.repositorio.obtenerPorId(conversacion.id);
    if (fresca === null) {
      throw new Error(`Conversación ${conversacion.id} ya no existe al reintentar la transición (D2).`);
    }

    const reintento = await this.intentar(fresca, destino, origen);
    if (reintento === null) {
      throw new ConflictoDeVersionPersistente(conversacion.id);
    }
    return reintento;
  }

  private async intentar(
    conversacion: Conversacion,
    destino: EstadoAtencion,
    origen: OrigenTransicion,
  ): Promise<Conversacion | null> {
    const ahora = this.clock.ahora();
    const resultado = calcularTransicion(
      conversacion.estado,
      destino,
      origen,
      ahora,
      this.configuracion.HUMANO_TTL_HORAS,
      this.configuracion.HANDOFF_TTL_MIN,
    );
    return this.repositorio.transicionar(
      conversacion.id,
      conversacion.version,
      resultado.destino,
      origen,
      resultado.expiraControlEn,
      ahora,
    );
  }
}
