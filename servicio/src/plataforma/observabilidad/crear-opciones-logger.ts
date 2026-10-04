import type { IncomingMessage } from 'node:http';
import type { Params } from 'nestjs-pino';
import { enmascarar } from '../../compartido/numero/index.js';
import { CLAVES_TELEFONO_SET, RUTAS_REDACCION } from './rutas-redaccion.js';

/** Subconjunto de {@link Configuracion} que necesita el logger (PLT3, D9). */
export interface ConfiguracionLogger {
  readonly LOG_LEVEL: string;
}

function sinQueryString(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const indice = url.indexOf('?');
  return indice === -1 ? url : url.slice(0, indice);
}

/**
 * Censor de `pino.redact` (R14): si la última clave de la ruta redactada es un campo de
 * teléfono, aplica `enmascarar` de `compartido/numero` (deja los últimos 4 dígitos); en
 * cualquier otro caso devuelve `"[REDACTADO]"`. `pino` invoca el censor por cada ruta que
 * coincide con {@link RUTAS_REDACCION}, con la lista de claves realmente atravesadas — no el
 * patrón — como segundo argumento.
 */
function censor(valor: unknown, ruta: readonly string[]): unknown {
  const ultimaClave = ruta.at(-1);
  if (ultimaClave !== undefined && CLAVES_TELEFONO_SET.has(ultimaClave) && typeof valor === 'string') {
    return enmascarar(valor);
  }
  return '[REDACTADO]';
}

/**
 * Construye las opciones de `nestjs-pino` (PLT3, R14) a partir de la {@link Configuracion}
 * validada. Función pura: no lee `process.env` ni abre ninguna conexión.
 *
 * - `redact` usa {@link RUTAS_REDACCION} con el {@link censor} de arriba.
 * - `serializers.req` conserva `id`, `method`, `headers` (para que las rutas HTTP de
 *   `RUTAS_REDACCION` tengan algo que redactar, p. ej. `req.headers.authorization`) y `url` sin
 *   query string; nunca registra el cuerpo de la petición.
 * - `autoLogging` ignora `GET /health` para no ensuciar los logs con el polling del health check.
 *
 * Un campo nuevo con datos personales MUST agregarse a `RUTAS_REDACCION` con su caso en el test
 * `R14 — Redacción en logs` (`crear-opciones-logger.spec.ts`).
 */
export function crearOpcionesLogger(config: ConfiguracionLogger): Params {
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [...RUTAS_REDACCION],
        censor,
      },
      serializers: {
        req: (request: IncomingMessage & { id?: unknown }) => ({
          id: request.id,
          method: request.method,
          url: sinQueryString(request.url),
          headers: request.headers,
        }),
      },
      autoLogging: {
        ignore: (request: IncomingMessage) =>
          request.method === 'GET' && sinQueryString(request.url) === '/health',
      },
    },
  };
}
