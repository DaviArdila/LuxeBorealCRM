import { createServer, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Puerto fijo del servidor HTTP local que sirve las fotos de este fixture (T10, IMP1, MED2-MED4):
 * `productos.csv` referencia sus enlaces de foto contra este mismo puerto en `127.0.0.1`, para que
 * tanto el test de integración de punta a punta como una ejecución manual del criterio de salida
 * (`npm run catalogo:importar -- --dir test/fixtures/catalogo`) puedan resolverlos sin tocar la red
 * real ni Google Drive — `descargarFoto` (T6) siempre hace `fetch` HTTP, nunca lee del disco. El
 * puerto es fijo (no efímero) porque el CSV es un archivo estático versionado, sin ningún mecanismo
 * de sustitución de plantillas en este repo (`csv.ts` parsea el contenido tal cual). Está **debajo** del
 * rango de puertos efímeros de Linux (32768-60999): otro test que haga `listen(0)` en paralelo (los
 * servidores falsos de Chatwoot y Telegram) podría recibir justo este puerto y dar `EADDRINUSE`.
 */
export const PUERTO_SERVIDOR_FOTOS_FIXTURE = 18785;

const DIRECTORIO_FOTOS = path.join(import.meta.dirname, 'fotos');

export interface ServidorFotosFixture {
  readonly cerrar: () => Promise<void>;
}

/** Arranca el servidor estático de fotos de este fixture en el puerto fijo de arriba. */
export async function iniciarServidorFotosFixture(): Promise<ServidorFotosFixture> {
  const servidor: Server = createServer((solicitud, respuesta) => {
    void manejarSolicitud(solicitud.url ?? '', respuesta);
  });

  await new Promise<void>((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(PUERTO_SERVIDOR_FOTOS_FIXTURE, '127.0.0.1', () => {
      servidor.removeListener('error', rechazar);
      resolver();
    });
  });

  return {
    cerrar: () =>
      new Promise<void>((resolver, rechazar) => {
        servidor.close((error) => (error ? rechazar(error) : resolver()));
      }),
  };
}

async function manejarSolicitud(url: string, respuesta: ServerResponse): Promise<void> {
  const nombreArchivo = url.replace(/^\/+/, '');
  if (!/^[\w-]+\.jpg$/.test(nombreArchivo)) {
    respuesta.writeHead(404).end();
    return;
  }
  try {
    const contenido = await readFile(path.join(DIRECTORIO_FOTOS, nombreArchivo));
    respuesta.writeHead(200, { 'content-type': 'image/jpeg' });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404).end();
  }
}
