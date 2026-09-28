import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';

function claveMarca(idMensaje: string): string {
  return `mensaje:${idMensaje}:procesado`;
}

// Cubre con margen amplio cualquier reentrega realista: reintentos del inbox con backoff
// exponencial (`INBOX_MAX_INTENTOS`) y el barrido periódico que reencola una fila atascada
// (`INBOX_BARRIDO_MS`, del orden de segundos/minutos). Seis horas es varias veces ese horizonte sin
// dejar la clave viva indefinidamente; no depende de configuración porque es un parámetro técnico de
// infraestructura, no dato de negocio (R15).
const TTL_MARCA_S = 6 * 60 * 60;

/**
 * Guarda de idempotencia ante reentrega `EventoCanal` de tipo `mensaje-entrante` (judgment-day
 * ronda 1, ADR-0004): `SET … NX EX` sobre `idMensaje`, mismo patrón que `MarcaEsperaHandoff`.
 * `marcarSiEsPrimeraVez` es atómica (`NX`): dos entregas concurrentes del mismo mensaje nunca pasan
 * ambas.
 *
 * Judgment-day ronda 2: la marca solo debe escribirse **después** de que el trabajo que protege
 * termina con éxito (ver TSDoc de `ConsumidorConversaciones.manejarMensajeEntrante`), nunca antes de
 * intentarlo. `estaProcesado` es la lectura de solo consulta que permite ese orden: el llamador
 * primero pregunta si ya existe la marca (para el corto-circuito idempotente habitual) y solo crea
 * la marca al final, tras completar el trabajo protegido, con `marcarSiEsPrimeraVez`.
 */
@Injectable()
export class MarcaMensajeProcesado {
  constructor(@Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis) {}

  /** `true` si la marca de este `idMensaje` ya existe (lectura de solo consulta, no la crea). */
  async estaProcesado(idMensaje: string): Promise<boolean> {
    await this.conectarSiHaceFalta();
    const valor = await this.redis.get(claveMarca(idMensaje));
    return valor !== null;
  }

  /** `true` si esta llamada creó la marca (primera vez que se ve este `idMensaje`); `false` si ya existía. */
  async marcarSiEsPrimeraVez(idMensaje: string): Promise<boolean> {
    await this.conectarSiHaceFalta();
    const resultado = await this.redis.set(claveMarca(idMensaje), '1', 'EX', TTL_MARCA_S, 'NX');
    return resultado === 'OK';
  }

  private async conectarSiHaceFalta(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'close' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }
}
