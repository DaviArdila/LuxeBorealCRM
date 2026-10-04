import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { PrismaService } from '../prisma/index.js';
import { CLOCK } from '../reloj/index.js';
import type { Clock } from '../reloj/index.js';
import { retrasoSegundos } from './backoff.js';
import { RegistroManejadoresOutbox } from './registro-manejadores.js';
import { FalloPublicacion } from './tipos.js';
import type { EntradaOutbox, PayloadOutbox } from './tipos.js';

/**
 * Tope defensivo de vueltas de {@link PublicadorOutbox.publicarPendientes} por llamada (D10): sin
 * este límite, una secuencia larga que siempre tiene una fila lista podría no devolver el control
 * nunca. No es un ajuste fino de rendimiento.
 */
const MAXIMO_VUELTAS = 50;

/** Filas reclamadas por vuelta (D10, "reclamar(lote)"); tampoco es un ajuste fino de rendimiento. */
const TAMANO_LOTE = 20;

/** `error` nunca lleva el `message` libre de una excepción no controlada (R14); truncado por si acaso. */
const LARGO_MAXIMO_ERROR = 200;

/** Describe una excepción inesperada (no {@link FalloPublicacion}) sin su `message` libre (R14). */
function describirError(error: unknown): string {
  if (error instanceof Error) {
    return error.constructor.name.slice(0, LARGO_MAXIMO_ERROR);
  }
  return 'error-desconocido';
}

interface FilaReclamada {
  readonly id: string;
  readonly tipo: string;
  readonly claveIdempotencia: string;
  readonly payload: PayloadOutbox;
  readonly intentos: number;
  readonly creado: Date;
}

/**
 * Publicador del outbox genérico (D10 de `openspec/changes/fase-04-canal-chatwoot/design.md`):
 * reclama filas con *lease* + `FOR UPDATE SKIP LOCKED`, respeta el orden estricto por `grupo` y
 * publica cada una con el {@link ManejadorOutbox} registrado para su `tipo` (D8, mismo patrón de
 * registro que `RegistroConsumidorEventosCanal`). No conoce `canales` ni ningún otro módulo de
 * negocio (regla de fronteras 7): el manejador de prueba de esta tarea (T6) no corresponde a
 * ningún `tipo` real; `PublicarEfectoCanal` llega en la Fase 04/T7.
 */
@Injectable()
export class PublicadorOutbox {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    private readonly registro: RegistroManejadoresOutbox,
  ) {}

  /**
   * Repite reclamar → publicar cada fila en orden, hasta que un reclamo vuelva vacío o se llegue
   * a {@link MAXIMO_VUELTAS} (D10): sin este bucle, cada paso de una secuencia esperaría al
   * siguiente barrido.
   */
  async publicarPendientes(): Promise<void> {
    for (let vuelta = 0; vuelta < MAXIMO_VUELTAS; vuelta += 1) {
      const filas = this.ordenar(await this.reclamar());
      if (filas.length === 0) {
        return;
      }
      for (const fila of filas) {
        await this.publicarFila(fila);
      }
    }
  }

  /**
   * `UPDATE ... FROM candidatos RETURNING` no garantiza el orden de la CTE que la seleccionó
   * (D10): se reordena en la aplicación por si Postgres no preserva el orden de materialización.
   */
  private ordenar(filas: readonly FilaReclamada[]): readonly FilaReclamada[] {
    return [...filas].sort((a, b) => {
      const porFecha = a.creado.getTime() - b.creado.getTime();
      if (porFecha !== 0) {
        return porFecha;
      }
      const porOrden = a.payload.orden - b.payload.orden;
      if (porOrden !== 0) {
        return porOrden;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  private async reclamar(): Promise<readonly FilaReclamada[]> {
    const ahora = this.clock.ahora();
    const proximoIntento = new Date(ahora.getTime() + this.configuracion.OUTBOX_LEASE_S * 1000);
    return this.prisma.$queryRaw<FilaReclamada[]>`
      WITH candidatos AS (
        SELECT o.id FROM outbox o
        WHERE o.enviado_en IS NULL AND o.error IS NULL AND o.proximo_intento <= ${ahora}
          AND NOT EXISTS (
            SELECT 1 FROM outbox p
            WHERE p.payload->>'grupo' = o.payload->>'grupo'
              AND p.enviado_en IS NULL AND p.error IS NULL
              AND (p.creado, (p.payload->>'orden')::int, p.id) < (o.creado, (o.payload->>'orden')::int, o.id))
        ORDER BY o.creado, (o.payload->>'orden')::int, o.id
        LIMIT ${TAMANO_LOTE}
        FOR UPDATE SKIP LOCKED)
      UPDATE outbox SET intentos = outbox.intentos + 1, proximo_intento = ${proximoIntento}
      FROM candidatos WHERE outbox.id = candidatos.id
      RETURNING outbox.id, outbox.tipo, outbox.clave_idempotencia AS "claveIdempotencia",
        outbox.payload, outbox.intentos, outbox.creado
    `;
  }

  private async publicarFila(fila: FilaReclamada): Promise<void> {
    const manejador = this.registro.obtener(fila.tipo);
    if (manejador === undefined) {
      await this.marcarMuerta(fila.id, 'sin-manejador');
      return;
    }

    const entrada: EntradaOutbox = {
      id: fila.id,
      tipo: fila.tipo,
      claveIdempotencia: fila.claveIdempotencia,
      grupo: fila.payload.grupo,
      orden: fila.payload.orden,
      datos: fila.payload.datos,
      efimero: fila.payload.efimero,
      intento: fila.intentos,
    };

    try {
      await manejador.publicar(entrada);
      await this.marcarEnviada(fila.id);
    } catch (error) {
      await this.manejarFallo(fila, error);
    }
  }

  private async manejarFallo(fila: FilaReclamada, error: unknown): Promise<void> {
    const fallo =
      error instanceof FalloPublicacion ? error : new FalloPublicacion('transitorio', describirError(error));

    if (fallo.clase === 'permanente') {
      await this.marcarMuerta(fila.id, `permanente: ${fallo.causa}`);
      await this.abortarSecuencia(fila);
      return;
    }

    if (fila.intentos >= this.configuracion.OUTBOX_MAX_INTENTOS) {
      await this.marcarMuerta(fila.id, `agotado: ${fallo.causa}`);
      return;
    }

    const esperaS = Math.max(
      retrasoSegundos(fila.intentos, this.configuracion.OUTBOX_BACKOFF_BASE_S, this.configuracion.OUTBOX_BACKOFF_MAX_S),
      Math.min(fallo.esperaSugeridaS ?? 0, this.configuracion.OUTBOX_BACKOFF_MAX_S),
    );
    await this.marcarPendiente(fila.id, esperaS);
  }

  private async marcarEnviada(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE outbox SET enviado_en = ${this.clock.ahora()}, payload = payload - 'efimero'
      WHERE id = ${id}::uuid
    `;
  }

  private async marcarMuerta(id: string, error: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE outbox SET error = ${error}, payload = payload - 'efimero'
      WHERE id = ${id}::uuid
    `;
  }

  private async marcarPendiente(id: string, esperaS: number): Promise<void> {
    const proximoIntento = new Date(this.clock.ahora().getTime() + esperaS * 1000);
    await this.prisma.$executeRaw`
      UPDATE outbox SET proximo_intento = ${proximoIntento} WHERE id = ${id}::uuid
    `;
  }

  /**
   * Fallo permanente (D10): las filas pendientes de la **misma secuencia** (`datos.secuencia`,
   * convención del módulo dueño — `plataforma/outbox` no sabe qué significa, solo que existe)
   * pasan a `error = 'secuencia abortada'`. Sin `datos.secuencia`, no hay nada que abortar.
   */
  private async abortarSecuencia(fila: FilaReclamada): Promise<void> {
    const secuencia = fila.payload.datos.secuencia;
    if (typeof secuencia !== 'string') {
      return;
    }
    await this.prisma.$executeRaw`
      UPDATE outbox SET error = 'secuencia abortada'
      WHERE payload->>'grupo' = ${fila.payload.grupo}
        AND payload->'datos'->>'secuencia' = ${secuencia}
        AND enviado_en IS NULL AND error IS NULL AND id != ${fila.id}::uuid
    `;
  }
}
