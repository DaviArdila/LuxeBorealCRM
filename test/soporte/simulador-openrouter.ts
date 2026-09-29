import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface UsoSimulado {
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
}

export interface CuerpoSolicitudSimulada {
  readonly model: string;
  readonly max_tokens?: number;
  readonly messages: readonly Record<string, unknown>[];
  readonly [clave: string]: unknown;
}

/**
 * Servidor HTTP local con el formato `chat/completions` de OpenRouter (D11 de la Fase 06). Se usa
 * con `createOpenRouter({ baseURL })`: prueba el mapeo real contra el AI SDK sin API key ni gasto.
 */
export class SimuladorOpenRouter {
  private readonly cuerpos: CuerpoSolicitudSimulada[] = [];
  private respuesta: { texto: string; uso: UsoSimulado } = {
    texto: '',
    uso: { tokensEntrada: 0, tokensSalida: 0 },
  };

  private readonly servidor: Server = createServer((req, res) => {
    void this.atender(req).then((cuerpoRespuesta) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(cuerpoRespuesta));
    });
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
    this.respuesta = { texto, uso };
  }

  ultimoCuerpo(): CuerpoSolicitudSimulada {
    const ultimo = this.cuerpos.at(-1);
    if (ultimo === undefined) {
      throw new Error('El simulador no recibió ninguna solicitud');
    }
    return ultimo;
  }

  async cerrar(): Promise<void> {
    await new Promise<void>((resolver, rechazar) =>
      this.servidor.close((error) => (error ? rechazar(error) : resolver())),
    );
  }

  private async atender(req: IncomingMessage): Promise<unknown> {
    const partes: Buffer[] = [];
    for await (const parte of req) {
      partes.push(parte as Buffer);
    }
    const cuerpo = JSON.parse(Buffer.concat(partes).toString('utf8')) as CuerpoSolicitudSimulada;
    this.cuerpos.push(cuerpo);
    const { texto, uso } = this.respuesta;
    return {
      id: 'gen-simulada',
      object: 'chat.completion',
      created: 0,
      model: cuerpo.model,
      choices: [
        { index: 0, message: { role: 'assistant', content: texto }, finish_reason: 'stop' },
      ],
      usage: {
        prompt_tokens: uso.tokensEntrada,
        completion_tokens: uso.tokensSalida,
        total_tokens: uso.tokensEntrada + uso.tokensSalida,
      },
    };
  }
}
