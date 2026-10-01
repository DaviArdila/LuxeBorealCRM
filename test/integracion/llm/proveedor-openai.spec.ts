import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { AdaptadorAiSdk } from '../../../src/modulos/llm/infraestructura/adaptador-ai-sdk.js';
import { crearProveedorOpenAi } from '../../../src/modulos/llm/infraestructura/proveedores/openai.js';
import {
  AdaptadorLlmError,
  type AdaptadorLlm,
} from '../../../src/modulos/llm/puertos/adaptador-llm.js';
import type {
  DefinicionHerramienta,
  SolicitudGeneracion,
} from '../../../src/modulos/llm/puertos/llm-port.js';
import { SimuladorOpenAi } from '../../soporte/simulador-openai.js';

// T4 (proveedores-llm-configurables): el proveedor `openai` real contra un servidor HTTP local con el
// formato de la API Responses, sin clave real ni gasto. La forma del uso y de la caché sale del código
// del paquete `@ai-sdk/openai` 4.0.81; contra la API real queda «a confirmar en T10».

const MODELO = 'gpt-6-luna';
const CLAVE = 'sk-clave-conocida-de-prueba-123456';
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
    if (error instanceof AdaptadorLlmError) {
      return error;
    }
    throw error;
  }
  throw new Error('El adaptador debía fallar con AdaptadorLlmError');
}

describe('llm — AdaptadorAiSdk con el proveedor OpenAI contra un servidor local', () => {
  let simulador: SimuladorOpenAi;
  let adaptador: AdaptadorLlm;
  const registrado: unknown[] = [];

  beforeAll(async () => {
    Logger.overrideLogger(false);
    for (const nivel of ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const) {
      vi.spyOn(Logger.prototype, nivel).mockImplementation((...argumentos: unknown[]) => {
        registrado.push(argumentos);
      });
    }
    simulador = await SimuladorOpenAi.iniciar();
    const proveedor = crearProveedorOpenAi({ OPENAI_API_KEY: CLAVE }, { baseURL: simulador.url });
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

  describe('envío directo y uso con caché (LLM15, LLM18)', () => {
    it('LLM18 — Un proveedor que incluye la caché en la entrada se separa', async () => {
      simulador.responderTexto('Te muestro el reloj', {
        tokensEntrada: 1000,
        tokensSalida: 20,
        tokensCache: 400,
      });

      const resultado = await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      expect(resultado.texto).toBe('Te muestro el reloj');
      expect(resultado.uso).toEqual({ tokensEntrada: 600, tokensSalida: 20, tokensCache: 400 });
    });

    it('LLM18 — Un proveedor sin dato de caché reporta cero', async () => {
      simulador.responderTexto('ok', { tokensEntrada: 55, tokensSalida: 5 });

      const resultado = await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      expect(resultado.uso).toEqual({ tokensEntrada: 55, tokensSalida: 5, tokensCache: 0 });
    });

    it('LLM15 — La llamada va al proveedor con el modelo sin prefijo y la clave propia', async () => {
      simulador.responderTexto('ok', { tokensEntrada: 1, tokensSalida: 1 });

      await adaptador.generarConModelo(MODELO, { ...SOLICITUD, herramientas: [BUSCAR] }, limite());

      const recibida = simulador.ultima();
      expect(recibida.ruta).toBe('/v1/responses');
      expect(recibida.autorizacion).toBe(`Bearer ${CLAVE}`);
      expect(recibida.cuerpo.model).toBe(MODELO);
      expect(recibida.cuerpo['max_output_tokens']).toBe(400);
    });
  });

  describe('errores: un solo intento y clasificación (LLM11, LLM22)', () => {
    it.each([408, 429, 503])(
      'LLM22 — Un %i de un proveedor directo es reintentable y no se repite',
      async (estado) => {
        simulador.responderError(estado);
        const antes = simulador.intentos;

        const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

        expect(error).toMatchObject({ clase: 'reintentable', causa: 'http', estadoHttp: estado });
        expect(simulador.intentos - antes).toBe(1);
      },
    );

    it.each([401, 403])(
      'LLM22 — Una clave rechazada (%i) por un proveedor directo no se reintenta',
      async (estado) => {
        simulador.responderError(estado);
        const antes = simulador.intentos;

        const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

        expect(error).toMatchObject({ clase: 'no-reintentable', causa: 'http', estadoHttp: estado });
        expect(simulador.intentos - antes).toBe(1);
      },
    );
  });

  describe('herramientas y metadatos (LLM2, LLM23)', () => {
    it('LLM23 — Los metadatos de una llamada de herramienta vuelven idénticos con un proveedor directo', async () => {
      simulador.responderLlamadas(
        [
          {
            idItem: 'fc_item_1',
            idLlamada: 'call_1',
            nombre: 'buscar_producto',
            argumentos: '{"consulta":"reloj"}',
          },
        ],
        { tokensEntrada: 30, tokensSalida: 12 },
      );
      const primera = await adaptador.generarConModelo(
        MODELO,
        { ...SOLICITUD, herramientas: [BUSCAR] },
        limite(),
      );
      const llamada = primera.llamadas?.[0];
      expect(llamada).toMatchObject({
        id: 'call_1',
        nombre: 'buscar_producto',
        argumentos: { consulta: 'reloj' },
      });
      expect(llamada?.metadatosProveedor).toEqual({ openai: { itemId: 'fc_item_1' } });

      simulador.responderTexto('listo', { tokensEntrada: 5, tokensSalida: 1 });
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
                  idLlamada: 'call_1',
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

      // El SDK usa `itemId` solo para herramientas propias de OpenAI (`item_reference`); una función
      // del negocio viaja con su `call_id` y sus argumentos, y el adaptador no toca los metadatos.
      const entrada = simulador.ultima().cuerpo.input;
      expect(entrada).toContainEqual({
        type: 'function_call',
        call_id: 'call_1',
        name: 'buscar_producto',
        arguments: '{"consulta":"reloj"}',
      });
      expect(entrada).toContainEqual({
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"encontrados":2}',
      });
    });
  });

  describe('claves y contenido fuera de logs y errores (LLM23, LLM24)', () => {
    it('LLM24 — Un error de proveedor no filtra la clave', async () => {
      simulador.responderError(401);
      registrado.length = 0;

      let capturado: unknown;
      try {
        await adaptador.generarConModelo(MODELO, SOLICITUD, limite());
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(AdaptadorLlmError);
      const texto = JSON.stringify(capturado, Object.getOwnPropertyNames(capturado));
      expect(texto).not.toContain(CLAVE);
      expect(String((capturado as Error).stack)).not.toContain(CLAVE);
      expect(JSON.stringify(registrado)).not.toContain(CLAVE);
    });

    it('LLM23 — Los logs del adaptador directo no contienen contenido ni PII', async () => {
      simulador.responderTexto(RESPUESTA_SECRETA, { tokensEntrada: 10, tokensSalida: 4 });
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
