import { RequestMethod, StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { montarDocumentacion } from './plataforma/documentacion/index.js';
import { construirProblema, fabricaErrorValidacion } from './plataforma/errores/index.js';

/** Forma mínima que `traducirErrorDeCuerpo` necesita de un error de `body-parser`/`raw-body`. */
interface ErrorDeCuerpoHttp {
  readonly type?: string;
}

/** Igual criterio que `SolicitudHttp` de `FiltroProblemJson` (D5 de 00b): sin tipos de `express`. */
interface SolicitudConUrl {
  readonly originalUrl?: string;
  readonly url?: string;
}

interface RespuestaProblemJson {
  status(codigo: number): this;
  type(tipo: string): this;
  json(cuerpo: unknown): void;
}

/**
 * Middleware de error de Express, no de NestJS (D2 — riesgo técnico verificado con un test de
 * integración real, no asumido): `entity.too.large` (413) y `entity.parse.failed` (400) los lanza
 * el parser de body **antes** de que el router de NestJS despache la petición, así que
 * `FiltroProblemJson` (el filtro global de excepciones, que solo ve la zona de excepciones de
 * NestJS) nunca los recibe — el RED de esta tarea confirmó que sin este middleware ambos casos
 * responden fuera de `application/problem+json` (uno incluso como 500 genérico). Se detecta por
 * arity de 4 parámetros (`(err, req, res, next)`), la convención nativa de Express para
 * middleware de error; cualquier otro error se reenvía sin tocar.
 */
function traducirErrorDeCuerpo(
  error: unknown,
  solicitud: SolicitudConUrl,
  respuesta: RespuestaProblemJson,
  siguiente: (error?: unknown) => void,
): void {
  const tipo = (error as ErrorDeCuerpoHttp | undefined)?.type;
  const instance = solicitud.originalUrl ?? solicitud.url;

  if (tipo === 'entity.too.large') {
    const problema = construirProblema('carga-demasiado-grande', { instance });
    respuesta.status(problema.status).type('application/problem+json').json(problema);
    return;
  }

  if (tipo === 'entity.parse.failed') {
    const problema = construirProblema('validacion-fallida', { instance });
    respuesta.status(problema.status).type('application/problem+json').json(problema);
    return;
  }

  siguiente(error);
}

/**
 * Opciones de creación de la app (D2 de `openspec/changes/fase-04-canal-chatwoot/design.md`):
 * `rawBody: true` retiene `req.rawBody` (Buffer) en cada petición JSON, para que
 * `GuardiaFirmaChatwoot` (T3) valide el HMAC sobre los bytes exactos que llegaron, nunca sobre
 * `JSON.stringify(req.body)` re-serializado. `main.ts`, `scripts/generar-contrato.ts` y los tests
 * (`test/contrato/soporte.ts`, `test/e2e/aplicacion.e2e-spec.ts`) crean la app con esta misma
 * constante, para que todos ejerciten exactamente el mismo cableado.
 */
export const OPCIONES_APLICACION = { rawBody: true } as const;

/**
 * Cableado de arranque reutilizable (D14 de `design.md` de 00a; D5 de 00b, T2; D6/D7 de 00b, T4;
 * D2 de la Fase 04, T3): logger de pino, prefijo global con la exención de `/health` (API2, D6),
 * pipe de validación global (soporte nativo de NestJS 12), límite de 1 MB para el body JSON (D2,
 * global — la vía nativa de NestJS no admite límites por ruta sin desmontar el parser global),
 * documentación en `/docs` (D7) y apagado ordenado. `main.ts`, `scripts/generar-contrato.ts` y el
 * test e2e (`test/e2e/aplicacion.e2e-spec.ts`) llaman esta misma función, para que la generación
 * del contrato y el e2e prueben exactamente el mismo cableado que producción.
 *
 * `exceptionFactory: fabricaErrorValidacion` (checkpoint (b) de `tasks.md`): en vez de dejar que
 * el pipe arme su `BadRequestException` por defecto (aplana cada issue a una cadena y pierde la
 * estructura), construye directamente un `ErrorDeAplicacion('validacion-fallida', ...)` que
 * `FiltroProblemJson` (D5) traduce a `problem+json`.
 *
 * El parámetro es `NestExpressApplication` (no el `INestApplication` genérico de antes): D2
 * necesita `useBodyParser`, que solo declara la interfaz de Express (`@nestjs/platform-express`,
 * dependencia de producción ya instalada, no de `express` directamente).
 */
export function configurarAplicacion(app: NestExpressApplication): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.use(traducirErrorDeCuerpo);
  app.useGlobalPipes(new StandardSchemaValidationPipe({ exceptionFactory: fabricaErrorValidacion }));
  montarDocumentacion(app);
  app.enableShutdownHooks();
}
