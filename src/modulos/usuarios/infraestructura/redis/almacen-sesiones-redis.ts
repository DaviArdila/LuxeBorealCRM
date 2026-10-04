import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { Sesion } from '../../dominio/sesion.js';
import type { AlmacenSesiones } from '../../puertos/almacen-sesiones.js';
import { generarIdSesion } from '../generar-id-sesion.js';

/** Forma de `generarIdSesion`: lo demás ni se consulta en Redis. */
const FORMATO_ID = /^[A-Za-z0-9_-]{43}$/;

interface SesionGuardada {
  readonly usuarioId: string;
  readonly creada: string;
  readonly ultimaActividad: string;
}

function clave(id: string): string {
  return `sesion:${id}`;
}

function serializar(sesion: Sesion): string {
  const guardada: SesionGuardada = {
    usuarioId: sesion.usuarioId,
    creada: sesion.creada.toISOString(),
    ultimaActividad: sesion.ultimaActividad.toISOString(),
  };
  return JSON.stringify(guardada);
}

function deserializar(texto: string): Sesion | null {
  try {
    const guardada = JSON.parse(texto) as Partial<SesionGuardada>;
    if (typeof guardada.usuarioId !== 'string' || typeof guardada.creada !== 'string') return null;
    const creada = new Date(guardada.creada);
    const ultimaActividad = new Date(guardada.ultimaActividad ?? guardada.creada);
    if (Number.isNaN(creada.getTime()) || Number.isNaN(ultimaActividad.getTime())) return null;
    return { usuarioId: guardada.usuarioId, creada, ultimaActividad };
  } catch {
    return null;
  }
}

/**
 * Sesiones en `sesion:<id>` con TTL de `SESION_INACTIVIDAD_MIN` (USR3, D1). Renovar reescribe la sesión con la nueva
 * última actividad y el TTL completo usando `SET … XX`: si otra petición la borró entre el `GET` y el `SET`, no la
 * resucita.
 */
@Injectable()
export class AlmacenSesionesRedis implements AlmacenSesiones {
  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async crear(sesion: Sesion): Promise<string> {
    await asegurarConexion(this.redis);
    const id = generarIdSesion();
    await this.redis.set(clave(id), serializar(sesion), 'EX', this.ttlS(), 'NX');
    return id;
  }

  async leerYRenovar(id: string, ahora: Date): Promise<Sesion | null> {
    if (!FORMATO_ID.test(id)) return null;
    await asegurarConexion(this.redis);
    const texto = await this.redis.get(clave(id));
    if (texto === null) return null;
    const sesion = deserializar(texto);
    if (sesion === null) return null;
    const renovada: Sesion = { ...sesion, ultimaActividad: ahora };
    const escrita = await this.redis.set(clave(id), serializar(renovada), 'EX', this.ttlS(), 'XX');
    return escrita === null ? null : renovada;
  }

  async borrar(id: string): Promise<void> {
    if (!FORMATO_ID.test(id)) return;
    await asegurarConexion(this.redis);
    await this.redis.del(clave(id));
  }

  private ttlS(): number {
    return this.configuracion.SESION_INACTIVIDAD_MIN * 60;
  }
}
