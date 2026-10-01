import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { AdaptadorLlmError, type AdaptadorLlm } from '../../../src/modulos/llm/puertos/adaptador-llm.js';
import { AdaptadorAiSdk } from '../../../src/modulos/llm/infraestructura/adaptador-ai-sdk.js';
import { crearProveedorOpenRouter } from '../../../src/modulos/llm/infraestructura/proveedores/openrouter.js';
import type {
  DefinicionHerramienta,
  SolicitudGeneracion,
} from '../../../src/modulos/llm/puertos/llm-port.js';
import { SimuladorOpenRouter } from '../../soporte/simulador-openrouter.js';

// T6 (fase-06-pasarela-llm): el adaptador real contra el simulador local de OpenRouter, sin API key
// ni gasto. LLM11 es el escenario primario; LLM1 y LLM2 confirman a nivel de integración lo que T2
// probó con el fake del puerto.

const MODELO = 'openai/gpt-5.6-luna';

const esquemaBusqueda = z.object({ consulta: z.string(), limite: z.number().int().optional() });
const BUSCAR: DefinicionHerramienta = {
  nombre: 'buscar_producto',
  descripcion: 'Busca un producto por texto',
  esquema: esquemaBusqueda,
  esquemaJson: z.toJSONSchema(esquemaBusqueda),
};

const SOLICITUD: SolicitudGeneracion = {
  perfil: 'conversacion',
  systemPrompt: 'Eres el asistente de la tienda.',
  mensajes: [{ rol: 'usuario', texto: 'Busco un reloj' }],
};

function limite(abort: AbortSignal = new AbortController().signal) {
  return { maxTokens: 400, abort };
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

describe('llm — AdaptadorAiSdk con el proveedor OpenRouter contra el simulador', () => {
  let simulador: SimuladorOpenRouter;
  let adaptador: AdaptadorLlm;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    simulador = await SimuladorOpenRouter.iniciar();
    const proveedor = crearProveedorOpenRouter({
      OPENROUTER_API_KEY: 'clave-de-prueba',
      OPENROUTER_BASE_URL: simulador.url,
    });
    const generico = new AdaptadorAiSdk();
    adaptador = {
      generarConModelo: (modelo, solicitud, limite) =>
        generico.generarConModelo(proveedor, modelo, solicitud, limite),
    };
  });

  afterAll(async () => {
    await simulador.cerrar();
  });

  describe('errores: un solo intento y propagación (LLM11)', () => {
    it('LLM11 — Adaptador fallido hace un solo intento y propaga el error', async () => {
      simulador.responderError(429);
      const antes = simulador.intentos;

      const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

      expect(error.clase).toBe('reintentable');
      expect(error.causa).toBe('http');
      expect(error.estadoHttp).toBe(429);
      expect(simulador.intentos - antes).toBe(1);
    });

    it.each([408, 503])(
      'un %i también es reintentable y tampoco se reintenta dentro del adaptador',
      async (estado) => {
        simulador.responderError(estado);
        const antes = simulador.intentos;

        const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

        expect(error).toMatchObject({ clase: 'reintentable', causa: 'http', estadoHttp: estado });
        expect(simulador.intentos - antes).toBe(1);
      },
    );

    it.each([400, 401, 403, 404, 422])('un %i no es reintentable', async (estado) => {
      simulador.responderError(estado);
      const antes = simulador.intentos;

      const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

      expect(error).toMatchObject({ clase: 'no-reintentable', causa: 'http', estadoHttp: estado });
      expect(simulador.intentos - antes).toBe(1);
    });

    it('una conexión cortada sin respuesta HTTP es reintentable por sin-respuesta', async () => {
      simulador.responderCortarConexion();
      const antes = simulador.intentos;

      const error = await errorAdaptador(adaptador.generarConModelo(MODELO, SOLICITUD, limite()));

      expect(error).toMatchObject({ clase: 'reintentable', causa: 'sin-respuesta' });
      expect(error.estadoHttp).toBeUndefined();
      expect(simulador.intentos - antes).toBe(1);
    });

    it('abortar la señal corta la llamada como timeout reintentable', async () => {
      simulador.responderColgar();
      const controlador = new AbortController();
      const antes = simulador.intentos;
      const pendiente = errorAdaptador(
        adaptador.generarConModelo(MODELO, SOLICITUD, limite(controlador.signal)),
      );
      setTimeout(() => {
        controlador.abort();
      }, 50);

      const error = await pendiente;

      expect(error).toMatchObject({ clase: 'reintentable', causa: 'timeout' });
      expect(simulador.intentos - antes).toBe(1);
    });
  });

  describe('mapeo de tipos propios (LLM1, LLM2, D6, D8)', () => {
    it('LLM1 — Generación con tipos propios sin SDK en el contrato', async () => {
      simulador.responderTexto('Te muestro el reloj', {
        tokensEntrada: 100,
        tokensSalida: 20,
        tokensCache: 40,
        costo: 0.0004,
      });

      const resultado = await adaptador.generarConModelo(
        'otro/modelo',
        { ...SOLICITUD, herramientas: [BUSCAR] },
        { maxTokens: 77, abort: new AbortController().signal },
      );

      expect(resultado.texto).toBe('Te muestro el reloj');
      expect(resultado.llamadas).toEqual([]);
      expect(resultado.uso).toEqual({ tokensEntrada: 60, tokensSalida: 20, tokensCache: 40 });
      const cuerpo = simulador.ultimoCuerpo();
      expect(cuerpo.model).toBe('otro/modelo');
      expect(cuerpo.max_tokens).toBe(77);
      expect(cuerpo.usage).toEqual({ include: true });
      expect(cuerpo.messages[0]).toEqual({
        role: 'system',
        content: [{ type: 'text', text: 'Eres el asistente de la tienda.' }],
      });
      expect(cuerpo.messages[1]).toEqual({ role: 'user', content: 'Busco un reloj' });
    });

    it('sin caché reportada los tokens de entrada quedan como los devuelve el proveedor', async () => {
      simulador.responderTexto('ok', { tokensEntrada: 55, tokensSalida: 5 });

      const resultado = await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      expect(resultado.uso).toEqual({ tokensEntrada: 55, tokensSalida: 5, tokensCache: 0 });
    });

    it('LLM2 — Definiciones y llamadas de herramientas se transportan sin interpretar', async () => {
      simulador.responderLlamadas(
        [
          { id: 'call_1', nombre: 'buscar_producto', argumentos: '{"consulta":"reloj","limite":3}' },
          { id: 'call_2', nombre: 'buscar_producto', argumentos: '{"consulta":42}' },
        ],
        { tokensEntrada: 30, tokensSalida: 12 },
      );

      const resultado = await adaptador.generarConModelo(
        MODELO,
        { ...SOLICITUD, herramientas: [BUSCAR] },
        limite(),
      );

      const herramienta = simulador.ultimoCuerpo().tools?.[0] as {
        type: string;
        function: { name: string; description: string; parameters: unknown };
      };
      expect(herramienta.type).toBe('function');
      expect(herramienta.function.name).toBe('buscar_producto');
      expect(herramienta.function.description).toBe('Busca un producto por texto');
      expect(herramienta.function.parameters).toEqual(BUSCAR.esquemaJson);
      // `toMatchObject`: el proveedor puede sumar `metadatosProveedor` opacos a cada llamada (D8).
      expect(resultado.llamadas).toMatchObject([
        { id: 'call_1', nombre: 'buscar_producto', argumentos: { consulta: 'reloj', limite: 3 } },
        { id: 'call_2', nombre: 'buscar_producto', argumentos: { consulta: 42 } },
      ]);
      expect(resultado.llamadas).toHaveLength(2);
    });

    it('una llamada con argumentos que no son JSON llega tal cual, nunca como objeto vacío', async () => {
      simulador.responderLlamadas(
        [{ id: 'call_x', nombre: 'buscar_producto', argumentos: '{consulta: sin comillas' }],
        { tokensEntrada: 10, tokensSalida: 4 },
      );

      const resultado = await adaptador.generarConModelo(
        MODELO,
        { ...SOLICITUD, herramientas: [BUSCAR] },
        limite(),
      );

      expect(resultado.llamadas).toHaveLength(1);
      expect(resultado.llamadas?.[0]?.argumentos).not.toEqual({});
      expect(resultado.llamadas?.[0]?.argumentos).toBe('{consulta: sin comillas');
    });

    it('el turno de vuelta de herramientas viaja al proveedor con sus ids y su marca de error', async () => {
      simulador.responderTexto('listo', { tokensEntrada: 5, tokensSalida: 1 });

      await adaptador.generarConModelo(
        MODELO,
        {
          ...SOLICITUD,
          mensajes: [
            { rol: 'usuario', texto: 'Busco un reloj' },
            {
              rol: 'asistente',
              texto: 'Voy a buscar',
              llamadasHerramienta: [
                { id: 'call_1', nombre: 'buscar_producto', argumentos: { consulta: 'reloj' } },
              ],
            },
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
          herramientas: [BUSCAR],
        },
        limite(),
      );

      const mensajes = simulador.ultimoCuerpo().messages;
      expect(mensajes[2]).toMatchObject({
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'buscar_producto', arguments: '{"consulta":"reloj"}' },
          },
        ],
      });
      expect(mensajes[3]).toEqual({
        role: 'tool',
        tool_call_id: 'call_1',
        name: 'buscar_producto',
        content: '{"encontrados":2}',
      });
    });

    it('LLM1 — Metadatos opacos del proveedor se transportan sin interpretar', async () => {
      simulador.responderTexto('con costo', {
        tokensEntrada: 10,
        tokensSalida: 2,
        costo: 0.000123,
      });

      const resultado = await adaptador.generarConModelo(MODELO, SOLICITUD, limite());

      expect(resultado.metadatos).toMatchObject({ openrouter: { usage: { cost: 0.000123 } } });
      expect(resultado.uso).toEqual({ tokensEntrada: 10, tokensSalida: 2, tokensCache: 0 });
    });
  });
});
