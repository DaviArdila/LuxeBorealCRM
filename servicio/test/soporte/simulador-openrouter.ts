import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface UsoSimulado {
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  // Tokens de entrada que OpenRouter atendió desde la caché de prompts (incluidos en `prompt_tokens`).
  readonly tokensCache?: number;
  readonly costo?: number;
}

export interface LlamadaSimulada {
  readonly id: string;
  readonly nombre: string;
  // Texto tal como lo devuelve un modelo: puede no ser JSON válido.
  readonly argumentos: string;
}

export interface CuerpoSolicitudSimulada {
  readonly model: string;
  readonly max_tokens?: number;
  readonly messages: readonly Record<string, unknown>[];
  readonly tools?: readonly Record<string, unknown>[];
  readonly usage?: { readonly include?: boolean };
  readonly [clave: string]: unknown;
}

type RespuestaSimulada =
  | {
      readonly tipo: 'exito';
      readonly texto: string;
      readonly uso: UsoSimulado;
      readonly llamadas: readonly LlamadaSimulada[];
    }
  | { readonly tipo: 'error'; readonly estado: number; readonly mensaje: string }
  | { readonly tipo: 'colgar' }
  | { readonly tipo: 'cortar' };

/**
 * Servidor HTTP local con el formato `chat/completions` de OpenRouter (D11 de la Fase 06). Se usa
 * con `createOpenRouter({ baseURL })`: prueba el mapeo real contra el AI SDK sin API key ni gasto.
 * La respuesta programada se repite hasta que se programe otra; `intentos` cuenta solicitudes.
 */
export class SimuladorOpenRouter {
  private readonly cuerpos: CuerpoSolicitudSimulada[] = [];
  private respuesta: RespuestaSimulada = {
    tipo: 'exito',
    texto: '',
    uso: { tokensEntrada: 0, tokensSalida: 0 },
    llamadas: [],
  };

  private readonly servidor: Server = createServer((req, res) => {
    void this.atender(req, res);
  });

  static async iniciar(): Promise<SimuladorOpenRouter> {
    const simulador = new SimuladorOpenRouter();
    await new Promise<void>((resolver) => simulador.servidor.listen(0, '127.0.0.1', resolver));
    return simulador;
  }

  get url(): string {
    const { port } = this.servidor.address() as AddressInfo;
    return `http://127.0.0.1:${port}/api/v1`;
  }

  get intentos(): number {
    return this.cuerpos.length;
  }

  responderTexto(texto: string, uso: UsoSimulado): void {
    this.respuesta = { tipo: 'exito', texto, uso, llamadas: [] };
  }

  responderLlamadas(llamadas: readonly LlamadaSimulada[], uso: UsoSimulado): void {
    this.respuesta = { tipo: 'exito', texto: '', uso, llamadas };
  }

  responderError(estado: number, mensaje = 'error simulado'): void {
    this.respuesta = { tipo: 'error', estado, mensaje };
  }

  // Recibe la solicitud y nunca responde: el cliente solo sale por su señal de aborto.
  responderColgar(): void {
    this.respuesta = { tipo: 'colgar' };
  }

  // Corta la conexión sin enviar ninguna respuesta HTTP (proveedor caído).
  responderCortarConexion(): void {
    this.respuesta = { tipo: 'cortar' };
  }

  ultimoCuerpo(): CuerpoSolicitudSimulada {
    const ultimo = this.cuerpos.at(-1);
    if (ultimo === undefined) {
      throw new Error('El simulador no recibió ninguna solicitud');
    }
    return ultimo;
  }

  async cerrar(): Promise<void> {
    this.servidor.closeAllConnections();
    await new Promise<void>((resolver, rechazar) =>
      this.servidor.close((error) => (error ? rechazar(error) : resolver())),
    );
  }

  private async atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const partes: Buffer[] = [];
    for await (const parte of req) {
      partes.push(parte as Buffer);
    }
    const cuerpo = JSON.parse(Buffer.concat(partes).toString('utf8')) as CuerpoSolicitudSimulada;
    this.cuerpos.push(cuerpo);

    const respuesta = this.respuesta;
    if (respuesta.tipo === 'colgar') {
      return;
    }
    if (respuesta.tipo === 'cortar') {
      req.socket.destroy();
      return;
    }
    if (respuesta.tipo === 'error') {
      res.writeHead(respuesta.estado, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ error: { message: respuesta.mensaje, code: respuesta.estado } }),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(this.cuerpoExito(cuerpo.model, respuesta)));
  }

  private cuerpoExito(modelo: string, respuesta: Extract<RespuestaSimulada, { tipo: 'exito' }>) {
    const { uso, llamadas } = respuesta;
    const mensaje =
      llamadas.length > 0
        ? {
            role: 'assistant',
            content: null,
            tool_calls: llamadas.map((llamada) => ({
              id: llamada.id,
              type: 'function',
              function: { name: llamada.nombre, arguments: llamada.argumentos },
            })),
          }
        : { role: 'assistant', content: respuesta.texto };
    return {
      id: 'gen-simulada',
      object: 'chat.completion',
      created: 0,
      model: modelo,
      choices: [
        {
          index: 0,
          message: mensaje,
          finish_reason: llamadas.length > 0 ? 'tool_calls' : 'stop',
        },
      ],
      usage: {
        prompt_tokens: uso.tokensEntrada,
        completion_tokens: uso.tokensSalida,
        total_tokens: uso.tokensEntrada + uso.tokensSalida,
        prompt_tokens_details: { cached_tokens: uso.tokensCache ?? 0 },
        ...(uso.costo === undefined ? {} : { cost: uso.costo }),
      },
    };
  }
}
