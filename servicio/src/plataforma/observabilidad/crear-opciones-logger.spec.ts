import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { enmascarar } from '../../compartido/numero/index.js';
import { crearOpcionesLogger } from './crear-opciones-logger.js';

// PLT3 / R14 — nombres de escenario tomados literalmente de
// `openspec/changes/fase-00a-esqueleto/specs/plataforma/spec.md` y de la convención de nombres de
// `R14 — Redacción en logs` fijada en `tasks.md` (T6) y `design.md` (D9).

interface StreamMemoria {
  readonly stream: Writable;
  readonly lineas: string[];
}

function crearStreamMemoria(): StreamMemoria {
  const lineas: string[] = [];
  const stream = new Writable({
    write(fragmento: Buffer | string, _codificacion, callback) {
      lineas.push(fragmento.toString());
      callback();
    },
  });
  return { stream, lineas };
}

function crearLoggerDePrueba(stream: Writable): pino.Logger {
  const opciones = crearOpcionesLogger({ LOG_LEVEL: 'info' });
  return pino(opciones.pinoHttp as pino.LoggerOptions, stream);
}

function ultimaLinea(lineas: readonly string[]): Record<string, unknown> {
  const contenido = lineas.at(-1);
  if (contenido === undefined) {
    throw new Error('el stream en memoria no recibió ninguna línea de log');
  }
  return JSON.parse(contenido) as Record<string, unknown>;
}

describe('plataforma/observabilidad — crearOpcionesLogger', () => {
  it('PLT3 — log normal produce una línea JSON con nivel, mensaje y metadatos', () => {
    const { stream, lineas } = crearStreamMemoria();
    const logger = crearLoggerDePrueba(stream);

    logger.info({ modulo: 'catalogo', accion: 'listar' }, 'operación completada');

    const linea = ultimaLinea(lineas);
    expect(linea).toMatchObject({
      level: 30,
      msg: 'operación completada',
      modulo: 'catalogo',
      accion: 'listar',
    });
  });

  it('R14 — Redacción en logs', () => {
    const { stream, lineas } = crearStreamMemoria();
    const logger = crearLoggerDePrueba(stream);

    logger.info(
      {
        mensaje: 'hola, necesito ayuda con mi pedido',
        telefono: '300 123 4567',
        cedula: '1000123456',
        correo: 'cliente@example.com',
        token: 'secreto-super-sensible',
        req: {
          headers: {
            authorization: 'Bearer abc123',
          },
        },
      },
      'nuevo mensaje entrante',
    );

    const linea = ultimaLinea(lineas);

    // El mensaje del log nunca lleva interpolación de datos personales (convención D9); solo se
    // redactan los campos con nombre.
    expect(linea.msg).toBe('nuevo mensaje entrante');

    // Contenido de mensaje → "[REDACTADO]".
    expect(linea.mensaje).toBe('[REDACTADO]');

    // Teléfono → solo los últimos 4 dígitos, vía `enmascarar` de `compartido/numero`.
    expect(linea.telefono).toBe(enmascarar('300 123 4567'));
    expect(linea.telefono).toBe('***4567');

    // Cédula → "[REDACTADO]".
    expect(linea.cedula).toBe('[REDACTADO]');

    // Correo → "[REDACTADO]".
    expect(linea.correo).toBe('[REDACTADO]');

    // Token/secreto → "[REDACTADO]".
    expect(linea.token).toBe('[REDACTADO]');

    // Caso HTTP: un header de autorización anidado bajo `req.headers` también sale redactado.
    const req = linea.req as { headers: { authorization: string } };
    expect(req.headers.authorization).toBe('[REDACTADO]');
  });

  it('USR9 — Los logs de una petición no contienen la cookie', () => {
    const { stream, lineas } = crearStreamMemoria();
    const logger = crearLoggerDePrueba(stream);
    const valorSesion = 'q'.repeat(43);

    logger.info(
      {
        req: { headers: { cookie: `luxe_sesion=${valorSesion}` } },
        res: { headers: { 'set-cookie': [`luxe_sesion=${valorSesion}; Path=/; HttpOnly`] } },
      },
      'petición atendida',
    );

    const linea = ultimaLinea(lineas);

    expect(JSON.stringify(linea)).not.toContain(valorSesion);
    expect((linea.req as { headers: { cookie: string } }).headers.cookie).toBe('[REDACTADO]');
    expect((linea.res as { headers: Record<string, unknown> }).headers['set-cookie']).toBe('[REDACTADO]');
  });
});
