import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** Una llamada a `sendMessage` tal como la vio el Telegram falso. */
export interface LlamadaTelegram {
  readonly ruta: string;
  readonly chatId: string | undefined;
  readonly texto: string | undefined;
}

export interface RespuestaTelegram {
  readonly status: number;
  readonly cuerpo?: unknown;
  readonly cabeceras?: Readonly<Record<string, string>>;
}

const PATRON_RUTA = /^\/bot([^/]+)\/sendMessage$/;

/**
 * Servidor HTTP local que imita `sendMessage` de la Bot API de Telegram (D9 de la Fase 08): el adaptador lo
 * llama con `fetch` de verdad, igual que `ChatwootFalso` con Chatwoot. Por defecto responde 200; las
 * respuestas programadas salen en orden FIFO (429 con `retry_after`, 500, 401…).
 */
export class TelegramFalso {
  private servidor: Server | undefined;
  private puerto = 0;
  private readonly llamadas: LlamadaTelegram[] = [];
  private readonly cola: RespuestaTelegram[] = [];

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

  llamadasRegistradas(): readonly LlamadaTelegram[] {
    return this.llamadas;
  }

  programarRespuesta(respuesta: RespuestaTelegram): void {
    this.cola.push(respuesta);
  }

  limpiar(): void {
    this.llamadas.length = 0;
    this.cola.length = 0;
  }

  private async manejar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ruta = new URL(req.url ?? '/', 'http://localhost').pathname;
    const partes: Buffer[] = [];
    for await (const parte of req) {
      partes.push(parte as Buffer);
    }
    const crudo = Buffer.concat(partes).toString('utf8');
    const cuerpo = crudo.length > 0 ? (JSON.parse(crudo) as { chat_id?: string; text?: string }) : {};
    // La ruta lleva el token del bot: se registra solo la forma, nunca el valor.
    this.llamadas.push({
      ruta: ruta.replace(PATRON_RUTA, '/bot<token>/sendMessage'),
      chatId: cuerpo.chat_id === undefined ? undefined : String(cuerpo.chat_id),
      texto: cuerpo.text,
    });

    const programada = this.cola.shift();
    if (!PATRON_RUTA.test(ruta)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const respuesta = programada ?? { status: 200, cuerpo: { ok: true, result: { message_id: 1 } } };
    for (const [nombre, valor] of Object.entries(respuesta.cabeceras ?? {})) {
      res.setHeader(nombre, valor);
    }
    res.statusCode = respuesta.status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(respuesta.cuerpo ?? {}));
  }
}
