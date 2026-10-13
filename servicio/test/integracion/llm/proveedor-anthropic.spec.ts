import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { AdaptadorAiSdk } from '../../../src/modulos/llm/infraestructura/adaptador-ai-sdk.js';
import { crearProveedorAnthropic } from '../../../src/modulos/llm/infraestructura/proveedores/anthropic.js';
import {
  AdaptadorLlmError,
  type AdaptadorLlm,
} from '../../../src/modulos/llm/puertos/adaptador-llm.js';
import type {
  DefinicionHerramienta,
  SolicitudGeneracion,
} from '../../../src/modulos/llm/puertos/llm-port.js';
import { SimuladorAnthropic } from '../../soporte/simulador-anthropic.js';

// LLM25 (ADR-0029): el proveedor `anthropic` real contra un servidor HTTP local con el formato de la API
// Messages, sin clave real ni gasto. La forma del cuerpo, del uso y de la caché sale del código del
// paquete `@ai-sdk/anthropic` 4.0.68; contra la API real queda a confirmar con las evals reales.

const MODELO = 'claude-haiku-5-5';
const CLAVE = 'sk-ant-clave-conocida-de-prueba-123456';
const PROMPT_SECRETO = 'texto-secreto-del-prompt-del-cliente';
const RESPUESTA_SECRETA = 'texto-secreto-de-la-respuesta-al-cliente';

const esquemaBusqueda = z.object({ consulta: z.string() });
const BUSCAR: DefinicionHerramienta = {
  nombre: 'buscar_producto',
  descripcion: 'Busca un producto por texto',
  esquema: esquemaBusqueda,
  esquemaJson: z.toJSONSchema(esquemaBusqueda),
};

const SOLICITUD: SolicitudGeneracion = {
  perfil: 'conversacion',
  systemPrompt: 'Eres el asistente de la tienda.',
  mensajes: [{ rol: 'usuario', texto: PROMPT_SECRETO }],
};

function limite() {
  return { maxTokens: 400, abort: new AbortController().signal };
}

async function errorAdaptador(promesa: Promise<unknown>): Promise<AdaptadorLlmError> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof AdaptadorLlmError) return error;
    throw error;
  }
  throw new Error('El adaptador debía fallar con AdaptadorLlmError');
}

describe('llm — AdaptadorAiSdk con el proveedor Anthropic contra un servidor local', () => {
  let simulador: SimuladorAnthropic;
  let adaptador: AdaptadorLlm;
  const registrado: unknown[] = [];

  beforeAll(async () => {
    Logger.overrideLogger(false);
    for (const nivel of ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const) {
      vi.spyOn(Logger.prototype, nivel).mockImplementation((...argumentos: unknown[]) => {
        registrado.push(argumentos);
      });
    }
    simulador = await SimuladorAnthropic.iniciar();
    const proveedor = crearProveedorAnthropic({ ANTHROPIC_API_KEY: CLAVE }, { baseURL: simulador.url });
    const generico = new AdaptadorAiSdk();
    adaptador = {
      generarConModelo: (modelo, solicitud, limiteIntento) =>
        generico.generarConModelo(proveedor, modelo, solicitud, limiteIntento),
    };
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await simulador.cerrar();
  });

  describe('cuerpo de la solicitud: modelo, esfuerzo y caché (LLM15, LLM25)', () => {
    it('LLM15 — La llamada va al proveedor con el modelo sin prefijo y la clave propia', async () => {
      simulador.responderTexto('ok', { entrada: 1, salida: 1 });

      await adaptador.generarConModelo(MODELO, { ...SOLICITUD, herramientas: [BUSCAR] }, limite());

      const recibida = simulador.ultima();
      expect(recibida.ruta).toBe('/v1/messages');
      expect(recibida.clave).toBe(CLAVE);
      expect(recibida.cuerpo['model']).toBe(MODELO);
      expect(recibida.cuerpo['max_tokens']).toBe(400);
    });

    it('LLM25 — cada llamada pide esfuerzo bajo y no envía presupuesto de razonamiento ni temperatura', async () => {
      simulador.responderTexto('ok', { entrada: 1, salida: 1 });

      await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      const cuerpo = simulador.ultima().cuerpo;
      expect(cuerpo['output_config']).toEqual({ effort: 'low' });
      expect(cuerpo['thinking']).toBeUndefined();
      expect(cuerpo['temperature']).toBeUndefined();
    });

    it('LLM25 — con clave de caché el prompt de sistema lleva cache_control y sin clave no', async () => {
      simulador.responderTexto('ok', { entrada: 1, salida: 1 });

      await adaptador.generarConModelo(MODELO, { ...SOLICITUD, claveCache: 'luxe-agente-v1-e3' }, limite());
      const conClave = simulador.ultima().cuerpo;
      await adaptador.generarConModelo(MODELO, SOLICITUD, limite());
      const sinClave = simulador.ultima().cuerpo;

      expect(conClave['system']).toEqual([
        { type: 'text', text: 'Eres el asistente de la tienda.', cache_control: { type: 'ephemeral' } },
      ]);
      expect(sinClave['system']).toEqual([{ type: 'text', text: 'Eres el asistente de la tienda.' }]);
      // La clave nunca viaja al proveedor: solo decide si se marca el punto de corte (R14).
      expect(JSON.stringify(conClave)).not.toContain('luxe-agente-v1-e3');
    });
  });

  describe('uso con caché (LLM18)', () => {
    it('LLM18 — Un proveedor que incluye la caché en la entrada se separa', async () => {
      simulador.responderTexto('Te muestro el reloj', { entrada: 100, salida: 20, lecturaCache: 900 });

      const resultado = await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      expect(resultado.texto).toBe('Te muestro el reloj');
      expect(resultado.uso).toEqual({ tokensEntrada: 100, tokensSalida: 20, tokensCache: 900 });
    });

    it('LLM18 — la escritura en caché se cuenta como entrada', async () => {
      simulador.responderTexto('ok', { entrada: 100, salida: 5, escrituraCache: 700, lecturaCache: 0 });

      const resultado = await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      expect(resultado.uso).toEqual({ tokensEntrada: 800, tokensSalida: 5, tokensCache: 0 });
    });

    it('LLM18 — Un proveedor sin dato de caché reporta cero', async () => {
      simulador.responderTexto('ok', { entrada: 55, salida: 5 });

      const resultado = await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      expect(resultado.uso).toEqual({ tokensEntrada: 55, tokensSalida: 5, tokensCache: 0 });
    });
  });

  describe('razonamiento y herramientas (LLM2, LLM23, LLM25)', () => {
    it('LLM25 — una respuesta con bloque de razonamiento devuelve solo el texto', async () => {
      simulador.responder(
        [
          { type: 'thinking', thinking: '', signature: 'firma-opaca' },
          { type: 'text', text: 'Tenemos dos modelos' },
        ],
        { entrada: 10, salida: 30 },
      );

      const resultado = await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      expect(resultado.texto).toBe('Tenemos dos modelos');
      expect(resultado.llamadas).toEqual([]);
    });

    it('LLM23 — una llamada de herramienta vuelve con su id, sus argumentos y su resultado', async () => {
      simulador.responder(
        [
          { type: 'thinking', thinking: '', signature: 'firma-opaca' },
          { type: 'tool_use', id: 'toolu_1', name: 'buscar_producto', input: { consulta: 'reloj' } },
        ],
        { entrada: 30, salida: 12 },
      );
      const primera = await adaptador.generarConModelo(
        MODELO,
        { ...SOLICITUD, herramientas: [BUSCAR] },
        limite(),
      );
      const llamada = primera.llamadas?.[0];
      expect(llamada).toMatchObject({
        id: 'toolu_1',
        nombre: 'buscar_producto',
        argumentos: { consulta: 'reloj' },
      });

      simulador.responderTexto('listo', { entrada: 5, salida: 1 });
      await adaptador.generarConModelo(
        MODELO,
        {
          ...SOLICITUD,
          herramientas: [BUSCAR],
          mensajes: [
            { rol: 'usuario', texto: PROMPT_SECRETO },
            { rol: 'asistente', llamadasHerramienta: llamada === undefined ? [] : [llamada] },
            {
              rol: 'usuario',
              resultadosHerramienta: [
                {
                  idLlamada: 'toolu_1',
                  nombre: 'buscar_producto',
                  resultado: { encontrados: 2 },
                  esError: false,
                },
              ],
            },
          ],
        },
        limite(),
      );

      // El historial del dominio no guarda bloques de razonamiento: el turno del asistente vuelve solo con
      // su `tool_use`, forma que la API acepta (el modelo sigue sin el razonamiento anterior).
      const mensajes = simulador.ultima().cuerpo.messages;
      expect(mensajes[1]).toMatchObject({
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'buscar_producto', input: { consulta: 'reloj' } }],
      });
      expect(mensajes[2]).toMatchObject({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }],
      });
    });
  });

  describe('errores: un solo intento y clasificación (LLM11, LLM22)', () => {
    it.each([408, 429, 529])(
      'LLM22 — Un %i de un proveedor directo es reintentable y no se repite',
      async (estado) => {
        simulador.responderError(estado);
        const antes = simulador.intentos;

        const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

        expect(error).toMatchObject({ clase: 'reintentable', causa: 'http', estadoHttp: estado });
        expect(simulador.intentos - antes).toBe(1);
      },
    );

    it('LLM22 — Una clave rechazada (401) por un proveedor directo no se reintenta', async () => {
      simulador.responderError(401);
      const antes = simulador.intentos;

      const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

      expect(error).toMatchObject({ clase: 'no-reintentable', causa: 'http', estadoHttp: 401 });
      expect(simulador.intentos - antes).toBe(1);
    });
  });

  describe('claves y contenido fuera de logs y errores (LLM23, LLM24)', () => {
    it('LLM24 — Un error de proveedor no filtra la clave', async () => {
      simulador.responderError(401);
      registrado.length = 0;

      const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(CLAVE);
      expect(String(error.stack)).not.toContain(CLAVE);
      expect(JSON.stringify(registrado)).not.toContain(CLAVE);
    });

    it('LLM23 — Los logs del adaptador directo no contienen contenido ni PII', async () => {
      simulador.responderTexto(RESPUESTA_SECRETA, { entrada: 10, salida: 4 });
      registrado.length = 0;

      await adaptador.generarConModelo(MODELO, { ...SOLICITUD, herramientas: [BUSCAR] }, limite());

      const logs = JSON.stringify(registrado);
      expect(registrado.length).toBeGreaterThan(0);
      expect(logs).not.toContain(PROMPT_SECRETO);
      expect(logs).not.toContain(RESPUESTA_SECRETA);
      expect(logs).not.toContain(CLAVE);
    });
  });
});
