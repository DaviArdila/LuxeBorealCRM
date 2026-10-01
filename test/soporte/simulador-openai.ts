import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface UsoOpenAiSimulado {
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  // Tokens de entrada servidos desde la caché de prompts (incluidos en `input_tokens`); `undefined`
  // omite `input_tokens_details`, como cuando el modelo no informa caché.
  readonly tokensCache?: number;
}

export interface LlamadaOpenAiSimulada {
  /** Id del ítem de la respuesta (`fc_...`); el SDK lo devuelve como metadato de la llamada. */
  readonly idItem: string;
  readonly idLlamada: string;
  readonly nombre: string;
  readonly argumentos: string;
}

export interface SolicitudOpenAiRecibida {
  readonly ruta: string;
  readonly autorizacion: string | undefined;
  readonly cuerpo: Record<string, unknown> & {
    readonly model: string;
    readonly input: readonly Record<string, unknown>[];
  };
}

type RespuestaOpenAi =
  | {
      readonly tipo: 'exito';
      readonly texto: string;
      readonly uso: UsoOpenAiSimulado;
      readonly llamadas: readonly LlamadaOpenAiSimulada[];
    }
  | { readonly tipo: 'error'; readonly estado: number };

/**
 * Servidor HTTP local con el formato de la API Responses de OpenAI (T4 de `proveedores-llm-
 * configurables`). Se usa con `createOpenAI({ baseURL })`: prueba el proveedor real contra el AI SDK
 * sin clave real ni gasto. La respuesta programada se repite hasta programar otra.
 */
export class SimuladorOpenAi {
  private readonly recibidas: SolicitudOpenAiRecibida[] = [];
  private respuesta: RespuestaOpenAi = {
    tipo: 'exito',
    texto: '',
    uso: { tokensEntrada: 0, tokensSalida: 0 },
    llamadas: [],
  };

  private readonly servidor: Server = createServer((req, res) => {
    void this.atender(req, res);
  });

  static async iniciar(): Promise<SimuladorOpenAi> {
    const simulador = new SimuladorOpenAi();
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

  responderTexto(texto: string, uso: UsoOpenAiSimulado): void {
    this.respuesta = { tipo: 'exito', texto, uso, llamadas: [] };
  }

  responderLlamadas(llamadas: readonly LlamadaOpenAiSimulada[], uso: UsoOpenAiSimulado): void {
    this.respuesta = { tipo: 'exito', texto: '', uso, llamadas };
  }

  responderError(estado: number): void {
    this.respuesta = { tipo: 'error', estado };
  }

  ultima(): SolicitudOpenAiRecibida {
    const ultima = this.recibidas.at(-1);
    if (ultima === undefined) {
      throw new Error('El simulador no recibió ninguna solicitud');
    }
    return ultima;
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
    const cuerpo = JSON.parse(Buffer.concat(partes).toString('utf8')) as SolicitudOpenAiRecibida['cuerpo'];
    this.recibidas.push({ ruta: req.url ?? '', autorizacion: req.headers.authorization, cuerpo });

    const respuesta = this.respuesta;
    if (respuesta.tipo === 'error') {
      res.writeHead(respuesta.estado, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: 'error simulado', type: 'simulado', param: null, code: 'simulado' },
        }),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(this.cuerpoExito(cuerpo.model, respuesta)));
  }

  private cuerpoExito(modelo: string, respuesta: Extract<RespuestaOpenAi, { tipo: 'exito' }>) {
    const { uso, llamadas } = respuesta;
    const salida =
      llamadas.length > 0
        ? llamadas.map((llamada) => ({
            type: 'function_call',
            id: llamada.idItem,
            call_id: llamada.idLlamada,
            name: llamada.nombre,
            arguments: llamada.argumentos,
          }))
        : [
            {
              type: 'message',
              role: 'assistant',
              id: 'msg_simulado',
              content: [{ type: 'output_text', text: respuesta.texto, annotations: [] }],
            },
          ];
    return {
      id: 'resp_simulada',
      created_at: 0,
      model: modelo,
      output: salida,
      usage: {
        input_tokens: uso.tokensEntrada,
        output_tokens: uso.tokensSalida,
        ...(uso.tokensCache === undefined
          ? {}
          : { input_tokens_details: { cached_tokens: uso.tokensCache } }),
      },
    };
  }
}
