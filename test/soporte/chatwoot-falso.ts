import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * Servidor HTTP local que imita las tres operaciones de la API de Chatwoot que usa
 * `AdaptadorCanalChatwoot` (`design.md`, tabla "File Changes", slice (d); T5): `POST
 * .../messages`, `POST .../toggle_status`, `GET`/`POST .../labels`, `GET .../messages` (D13). No es
 * un doble en memoria del puerto `AdaptadorCanal` — es un servidor HTTP real para que
 * `ClienteChatwoot` lo llame con `fetch` de verdad, siguiendo el mismo criterio que
 * `test/integracion/canales/webhook.spec.ts` usa Postgres/Redis reales en vez de dobles.
 */
export interface LlamadaRegistrada {
  readonly metodo: string;
  readonly ruta: string;
  readonly apiAccessToken: string | undefined;
  readonly cuerpo: unknown;
}

export interface RespuestaProgramada {
  readonly status: number;
  readonly cuerpo?: unknown;
  readonly cabeceras?: Readonly<Record<string, string>>;
  /** Retrasa la respuesta este número de ms; permite simular un timeout del cliente (CAN7). */
  readonly retrasoMs?: number;
}

const PATRON_RUTA_CONVERSACION = /\/conversations\/([^/]+)\/(messages|toggle_status|labels)$/;

export class ChatwootFalso {
  private servidor: Server | undefined;
  private puerto = 0;
  private readonly llamadas: LlamadaRegistrada[] = [];
  private readonly colaRespuestas: RespuestaProgramada[] = [];
  private readonly mensajesPorConversacion = new Map<string, unknown[]>();
  private readonly etiquetasPorConversacion = new Map<string, string[]>();

  async iniciar(): Promise<void> {
    this.servidor = createServer((req, res) => {
      this.manejar(req, res).catch(() => {
        res.statusCode = 500;
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      this.servidor?.listen(0, '127.0.0.1', () => resolve());
    });
    const direccion = this.servidor?.address();
    this.puerto = direccion && typeof direccion === 'object' ? direccion.port : 0;
  }

  async detener(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.servidor?.close((error) => (error ? reject(error) : resolve()));
    });
  }

  url(): string {
    return `http://127.0.0.1:${this.puerto}`;
  }

  llamadasRegistradas(): readonly LlamadaRegistrada[] {
    return this.llamadas;
  }

  /** Limpia llamadas registradas, respuestas programadas y el estado simulado entre tests. */
  limpiar(): void {
    this.llamadas.length = 0;
    this.colaRespuestas.length = 0;
    this.mensajesPorConversacion.clear();
    this.etiquetasPorConversacion.clear();
  }

  /** La próxima llamada (orden FIFO) responde con esto en vez del comportamiento por defecto. */
  programarRespuesta(respuesta: RespuestaProgramada): void {
    this.colaRespuestas.push(respuesta);
  }

  /** Simula un mensaje ya creado con esa marca (D13): lo que devuelve `GET .../messages`. */
  programarMensajeExistente(idConversacion: string, luxeClave: string): void {
    const lista = this.mensajesPorConversacion.get(idConversacion) ?? [];
    lista.push({ id: lista.length + 1, content_attributes: { luxe_clave: luxeClave } });
    this.mensajesPorConversacion.set(idConversacion, lista);
  }

  /**
   * Simula el mensaje entrante del cliente con su texto (D16 de la Fase 05): lo que el consumidor de
   * `conversaciones` lee con `GET .../messages` cuando el tipo de contenido es `texto`.
   */
  programarTextoDeMensaje(idConversacion: string, idMensaje: number, texto: string): void {
    const lista = this.mensajesPorConversacion.get(idConversacion) ?? [];
    lista.push({ id: idMensaje, content: texto });
    this.mensajesPorConversacion.set(idConversacion, lista);
  }

  /** Simula etiquetas ya puestas por un asesor (D15): lo que devuelve `GET .../labels`. */
  programarEtiquetasExistentes(idConversacion: string, etiquetas: readonly string[]): void {
    this.etiquetasPorConversacion.set(idConversacion, [...etiquetas]);
  }

  private async manejar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const cuerpoCrudo = await leerCuerpo(req);
    const cuerpo = cuerpoCrudo.length > 0 ? (JSON.parse(cuerpoCrudo.toString('utf8')) as unknown) : undefined;
    const apiAccessToken = primeraCabecera(req.headers['api_access_token']);
    this.llamadas.push({ metodo: req.method ?? '', ruta: url.pathname, apiAccessToken, cuerpo });

    const programada = this.colaRespuestas.shift();
    if (programada) {
      if (programada.retrasoMs) await esperar(programada.retrasoMs);
      for (const [nombre, valor] of Object.entries(programada.cabeceras ?? {})) {
        res.setHeader(nombre, valor);
      }
      responderJson(res, programada.status, programada.cuerpo);
      return;
    }

    this.responderPorDefecto(req.method ?? '', url.pathname, cuerpo, res);
  }

  private responderPorDefecto(metodo: string, ruta: string, cuerpo: unknown, res: ServerResponse): void {
    const coincidencia = PATRON_RUTA_CONVERSACION.exec(ruta);
    if (!coincidencia) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const idConversacion = coincidencia[1];
    const operacion = coincidencia[2];

    if (operacion === 'messages' && metodo === 'GET') {
      responderJson(res, 200, { payload: this.mensajesPorConversacion.get(idConversacion) ?? [] });
      return;
    }
    if (operacion === 'messages' && metodo === 'POST') {
      responderJson(res, 200, { id: this.mensajesPorConversacion.size + 1 });
      return;
    }
    if (operacion === 'toggle_status' && metodo === 'POST') {
      responderJson(res, 200, { success: true });
      return;
    }
    if (operacion === 'labels' && metodo === 'GET') {
      responderJson(res, 200, { payload: this.etiquetasPorConversacion.get(idConversacion) ?? [] });
      return;
    }
    if (operacion === 'labels' && metodo === 'POST') {
      const etiquetas = extraerEtiquetasDelCuerpo(cuerpo);
      this.etiquetasPorConversacion.set(idConversacion, etiquetas);
      responderJson(res, 200, { payload: etiquetas });
      return;
    }
    res.statusCode = 404;
    res.end();
  }
}

function extraerEtiquetasDelCuerpo(cuerpo: unknown): string[] {
  const labels = (cuerpo as { labels?: unknown } | undefined)?.labels;
  return Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [];
}

function responderJson(res: ServerResponse, status: number, cuerpo: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo));
}

function primeraCabecera(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

async function leerCuerpo(req: IncomingMessage): Promise<Buffer> {
  const trozos: Buffer[] = [];
  for await (const trozo of req as AsyncIterable<Buffer>) trozos.push(trozo);
  return Buffer.concat(trozos);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
