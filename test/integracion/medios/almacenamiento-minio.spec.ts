import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Configuracion } from '../../../src/plataforma/config/index.js';
import { AlmacenamientoMinio } from '../../../src/modulos/medios/infraestructura/almacenamiento-minio.js';
import {
  bucketMinioDePrueba,
  credencialesMinioDePrueba,
  urlMinioDePrueba,
} from '../../soporte/infraestructura.js';

/**
 * Contra MinIO real vía Testcontainers (D9, MED1). El bucket de pruebas ya existe/se confirma en
 * `contenedores.global-setup.ts`, así que ningún test de este archivo lo crea.
 */
function crearAlmacenamiento(): AlmacenamientoMinio {
  const { accessKeyId, secretAccessKey } = credencialesMinioDePrueba();
  const url = new URL(urlMinioDePrueba());
  const configuracion: Configuracion = {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://luxe:luxe@localhost:5435/luxeboreal',
    REDIS_URL: 'redis://localhost:6380',
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: false,
    MINIO_ENDPOINT: url.hostname,
    MINIO_PUERTO: Number(url.port),
    MINIO_SSL: url.protocol === 'https:',
    MINIO_ACCESS_KEY: accessKeyId,
    MINIO_SECRET_KEY: secretAccessKey,
    MINIO_BUCKET: bucketMinioDePrueba(),
    MINIO_URL_PUBLICA: undefined,
    CATALOGO_SHEET_ID: undefined,
    CHATWOOT_URL: 'http://localhost:3001',
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: '',
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 10000,
    COLAS_PREFIJO: 'luxe:colas',
    COLAS_TRABAJADORES: true,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    OUTBOX_BACKOFF_BASE_S: 15,
    OUTBOX_BACKOFF_MAX_S: 300,
    OUTBOX_BARRIDO_MS: 5000,
    OUTBOX_LEASE_S: 60,
    HUMANO_TTL_HORAS: 3,
    HANDOFF_TTL_MIN: 45,
    LOCK_TURNO_TTL_S: 30,
    RATE_LIMIT_POR_HORA: 20,
    RATE_LIMIT_POR_DIA: 60,
    DEBOUNCE_MS: 3000,
    CONVERSACIONES_CONCURRENCIA: 10,
  };

  return new AlmacenamientoMinio(configuracion);
}

describe('Puerto Almacenamiento sobre MinIO (T5, integración)', () => {
  let almacenamiento: AlmacenamientoMinio;
  let clave: string;

  beforeEach(() => {
    almacenamiento = crearAlmacenamiento();
    clave = `catalogo/prueba-${crypto.randomUUID()}/foto-1.jpg`;
  });

  afterEach(async () => {
    // Limpieza best-effort: `eliminar` no falla si la clave ya no existe (MED1, tercer escenario).
    await almacenamiento.eliminar(clave);
  });

  it('MED1 — Guardar un archivo lo asocia a una clave de objeto, no a una ruta de disco', async () => {
    const contenido = Buffer.from('contenido-de-prueba-jpeg');

    await almacenamiento.guardar(clave, contenido, 'image/jpeg');

    const url = await almacenamiento.obtenerUrl(clave);
    expect(url).not.toMatch(/^[a-zA-Z]:\\|^\//); // ninguna ruta de filesystem (absoluta o de Windows)
    expect(url).toContain(clave);
  });

  it('MED1 — Obtener la URL de una clave guardada devuelve una URL utilizable', async () => {
    const contenido = Buffer.from('contenido-de-prueba-jpeg');
    await almacenamiento.guardar(clave, contenido, 'image/jpeg');

    const url = await almacenamiento.obtenerUrl(clave);
    const respuesta = await fetch(url);

    expect(respuesta.status).toBe(200);
    expect(Buffer.from(await respuesta.arrayBuffer())).toEqual(contenido);
  });

  it('MED1 — Eliminar una clave borra el objeto correspondiente', async () => {
    const contenido = Buffer.from('contenido-de-prueba-jpeg');
    await almacenamiento.guardar(clave, contenido, 'image/jpeg');
    const url = await almacenamiento.obtenerUrl(clave);
    expect((await fetch(url)).status).toBe(200);

    await almacenamiento.eliminar(clave);

    expect((await fetch(url)).status).toBe(404);
  });
});
