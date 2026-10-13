import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface UsoAnthropicSimulado {
  readonly entrada: number;
  readonly salida: number;
  readonly escrituraCache?: number;
  readonly lecturaCache?: number;
}

export interface SolicitudAnthropicRecibida {
  readonly ruta: string;
  readonly clave: string | undefined;
  readonly cuerpo: Record<string, unknown> & {
    readonly model: string;
    readonly messages: readonly Record<string, unknown>[];
  };
}

type Respuesta =
  | { readonly tipo: 'exito'; readonly contenido: readonly Record<string, unknown>[]; readonly uso: UsoAnthropicSimulado }
  | { readonly tipo: 'error'; readonly estado: number };

/**
 * Servidor HTTP local con el formato de `POST /v1/messages` de Anthropic (LLM25, ADR-0029). Se usa con
 * `crearProveedorAnthropic(config, { baseURL })`: prueba el proveedor real sin clave real ni gasto. La
 * respuesta programada se repite hasta programar otra.
 */
export class SimuladorAnthropic {
  private readonly recibidas: SolicitudAnthropicRecibida[] = [];
  private respuesta: Respuesta = { tipo: 'exito', contenido: [], uso: { entrada: 0, salida: 0 } };
  private readonly servidor: Server = createServer((req, res) => {
    void this.atender(req, res);
  });

  static async iniciar(): Promise<SimuladorAnthropic> {
    const simulador = new SimuladorAnthropic();
    await new Promise<void>((resolver) => simulador.servidor.listen(0, '127.0.0.1', resolver));
    return simulador;
  }

  get url(): string {
    const { port } = this.servidor.address() as AddressInfo;
    return `http://127.0.0.1:${port}/v1`;
  }

  get intentos(): number {
    return this.recibidas.length;
  }

  responder(contenido: readonly Record<string, unknown>[], uso: UsoAnthropicSimulado): void {
    this.respuesta = { tipo: 'exito', contenido, uso };
  }

  responderTexto(texto: string, uso: UsoAnthropicSimulado): void {
    this.responder([{ type: 'text', text: texto }], uso);
  }

  responderError(estado: number): void {
    this.respuesta = { tipo: 'error', estado };
  }

  ultima(): SolicitudAnthropicRecibida {
    const ultima = this.recibidas.at(-1);
    if (ultima === undefined) throw new Error('El simulador no recibió ninguna solicitud');
    return ultima;
  }

  async cerrar(): Promise<void> {
    await new Promise<void>((resolver) => this.servidor.close(() => resolver()));
  }

  private async atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const partes: Buffer[] = [];
    for await (const parte of req) partes.push(parte as Buffer);
    const clave = req.headers['x-api-key'];
    this.recibidas.push({
      ruta: req.url ?? '',
      clave: Array.isArray(clave) ? clave[0] : clave,
      cuerpo: JSON.parse(Buffer.concat(partes).toString('utf8')) as SolicitudAnthropicRecibida['cuerpo'],
    });
    res.setHeader('content-type', 'application/json');
    if (this.respuesta.tipo === 'error') {
      res.statusCode = this.respuesta.estado;
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'falla simulada' } }));
      return;
    }
    const { contenido, uso } = this.respuesta;
    const { model } = this.ultima().cuerpo;
    res.end(
      JSON.stringify({
        type: 'message',
        id: 'msg_simulado',
        role: 'assistant',
        model,
        content: contenido,
        stop_reason: contenido.some((bloque) => bloque['type'] === 'tool_use') ? 'tool_use' : 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: uso.entrada,
          output_tokens: uso.salida,
          ...(uso.escrituraCache === undefined ? {} : { cache_creation_input_tokens: uso.escrituraCache }),
          ...(uso.lecturaCache === undefined ? {} : { cache_read_input_tokens: uso.lecturaCache }),
        },
      }),
    );
  }
}
