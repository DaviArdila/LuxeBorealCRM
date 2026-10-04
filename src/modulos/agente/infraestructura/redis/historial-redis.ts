import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { ClaveSesion } from '../../puertos/contadores-sesion.js';
import type { HistorialConversacion, TurnoHistorial } from '../../puertos/historial-conversacion.js';

function claveHistorial(sesion: ClaveSesion): string {
  return `agente:${sesion.conversacionId}:v${String(sesion.version)}:historial`;
}

function esTurno(dato: unknown): dato is TurnoHistorial {
  if (typeof dato !== 'object' || dato === null) {
    return false;
  }
  const { rol, texto } = dato as Record<string, unknown>;
  return (rol === 'usuario' || rol === 'asistente') && typeof texto === 'string';
}

/**
 * Adaptador Redis de {@link HistorialConversacion} (D3 de la Fase 07b, ADR-0017): una lista por sesión
 * (`conversacionId` + `version`) con una entrada JSON por mensaje, recortada a
 * `2 × AGENTE_HISTORIAL_TURNOS` y con `EXPIRE AGENTE_SESION_TTL_H`. Una entrada ilegible se descarta:
 * el historial es memoria de trabajo, nunca un dato que deba tumbar el turno.
 */
@Injectable()
export class HistorialRedis implements HistorialConversacion {
  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION)
    private readonly configuracion: Pick<Configuracion, 'AGENTE_HISTORIAL_TURNOS' | 'AGENTE_SESION_TTL_H'>,
  ) {}

  async leer(sesion: ClaveSesion, turnos: number): Promise<readonly TurnoHistorial[]> {
    if (turnos <= 0) {
      return [];
    }
    await asegurarConexion(this.redis);
    const entradas = await this.redis.lrange(claveHistorial(sesion), -2 * turnos, -1);
    return entradas.flatMap((entrada): TurnoHistorial[] => {
      try {
        const dato: unknown = JSON.parse(entrada);
        return esTurno(dato) ? [{ rol: dato.rol, texto: dato.texto }] : [];
      } catch {
        return [];
      }
    });
  }

  async agregar(sesion: ClaveSesion, textoCliente: string, textoBot: string): Promise<void> {
    const maximo = 2 * this.configuracion.AGENTE_HISTORIAL_TURNOS;
    if (maximo === 0) {
      return;
    }
    await asegurarConexion(this.redis);
    const clave = claveHistorial(sesion);
    await this.redis
      .multi()
      .rpush(
        clave,
        JSON.stringify({ rol: 'usuario', texto: textoCliente }),
        JSON.stringify({ rol: 'asistente', texto: textoBot }),
      )
      .ltrim(clave, -maximo, -1)
      .expire(clave, this.configuracion.AGENTE_SESION_TTL_H * 3600)
      .exec();
  }
}
