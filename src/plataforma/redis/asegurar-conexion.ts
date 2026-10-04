/**
 * Plazo máximo para esperar a que un cliente en curso de conexión quede `ready`. Coincide con el
 * `connectTimeout` por defecto de `ioredis` (10 s), que `redis.module.ts` no cambia: es un parámetro
 * técnico de infraestructura, no dato de negocio (R15).
 */
export const PLAZO_CONEXION_MS = 10_000;

/**
 * Parte del contrato de `ioredis` que necesita {@link asegurarConexion}. `ClienteRedis` la cumple; los
 * tests usan un cliente falso sobre `EventEmitter`.
 */
export interface ClienteConectable {
  readonly status: string;
  connect(): Promise<void>;
  once(evento: string, oyente: (...argumentos: unknown[]) => void): unknown;
  removeListener(evento: string, oyente: (...argumentos: unknown[]) => void): unknown;
}

const ESTADOS_SIN_CONEXION = new Set(['wait', 'close', 'end']);

function esConexionYaEnCurso(error: unknown): boolean {
  return error instanceof Error && /already connecting\/connected/.test(error.message);
}

/**
 * Deja el cliente Redis de plataforma listo para recibir comandos. El cliente usa
 * `lazyConnect: true` y `enableOfflineQueue: false` (`redis.module.ts`): un comando emitido antes del
 * `ready` se rechaza al instante con "Stream isn't writeable…", así que todo adaptador llama a esta
 * función antes de cada comando.
 *
 * - `ready`: vuelve sin hacer nada.
 * - `wait`, `close` o `end`: llama a `connect()`, que resuelve en el `ready`. El estado pasa a
 *   `connecting` de forma síncrona, así que una segunda llamada concurrente cae en el caso siguiente
 *   y no repite `connect()`. Si aun así `connect()` rechaza con "Redis is already
 *   connecting/connected" (no es idempotente), se espera el `ready` en vez de fallar.
 * - `connecting`, `connect`, `reconnecting`: espera el evento `ready`; rechaza ante `error` o `end`,
 *   o al vencer `plazoMs`. Retira sus oyentes y su temporizador en todos los caminos.
 *
 * Antes cada adaptador tenía su copia de `conectarSiHaceFalta`, que en estos estados volvía sin
 * esperar y dejaba pasar el comando con el socket aún no escribible
 * (`odd/tasks/conexion-redis-perezosa.md`).
 */
export async function asegurarConexion(
  cliente: ClienteConectable,
  plazoMs: number = PLAZO_CONEXION_MS,
): Promise<void> {
  if (cliente.status === 'ready') {
    return;
  }
  if (ESTADOS_SIN_CONEXION.has(cliente.status)) {
    try {
      await cliente.connect();
      return;
    } catch (error) {
      if (!esConexionYaEnCurso(error)) {
        throw error;
      }
      if (cliente.status === 'ready') {
        return;
      }
    }
  }
  await esperarListo(cliente, plazoMs);
}

function esperarListo(cliente: ClienteConectable, plazoMs: number): Promise<void> {
  return new Promise<void>((resolver, rechazar) => {
    const limpiar = (): void => {
      clearTimeout(temporizador);
      cliente.removeListener('ready', alListo);
      cliente.removeListener('error', alError);
      cliente.removeListener('end', alTerminar);
    };
    const alListo = (): void => {
      limpiar();
      resolver();
    };
    const alError = (error: unknown): void => {
      limpiar();
      rechazar(error instanceof Error ? error : new Error('Error de Redis al esperar la conexión'));
    };
    const alTerminar = (): void => {
      limpiar();
      rechazar(new Error('La conexión a Redis terminó antes de quedar lista'));
    };
    // `setTimeout` mide una duración, no lee la hora actual: no aplica la regla del `Clock`.
    const temporizador = setTimeout(() => {
      limpiar();
      rechazar(new Error(`Redis no quedó listo dentro del plazo de ${String(plazoMs)} ms`));
    }, plazoMs);
    cliente.once('ready', alListo);
    cliente.once('error', alError);
    cliente.once('end', alTerminar);
  });
}
