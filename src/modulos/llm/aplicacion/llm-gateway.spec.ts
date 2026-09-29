import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { FakeAdaptadorLlm } from '../../../../test/fakes/adaptador-llm-falso.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { RepositorioUsoLlmEnMemoria } from '../../../../test/fakes/repositorio-uso-llm-en-memoria.js';
import { TemporizadorLlmFalso } from '../../../../test/fakes/temporizador-llm-falso.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../../../test/soporte/configuracion-llm-de-prueba.js';
import { ErrorPasarelaLlm } from '../dominio/error-pasarela-llm.js';
import type { SolicitudGeneracion } from '../dominio/tipos-llm.js';
import { AdaptadorLlmError } from '../puertos/adaptador-llm.js';
import type { ConfigGatewayLlm } from './config-gateway-llm.js';
import { LlmGateway } from './llm-gateway.js';

// Escenarios LLM3 y LLM4 de `openspec/changes/fase-06-pasarela-llm/specs/llm/spec.md` sobre el
// gateway v1 (un solo modelo por perfil; el fallback llega en T5).

const MODELO = 'openai/gpt-5.6-luna';
const INICIO = new Date('2026-09-28T12:00:00.000Z');

beforeAll(() => {
  Logger.overrideLogger(false);
});

const SOLICITUD: SolicitudGeneracion = {
  perfil: 'conversacion',
  mensajes: [{ rol: 'usuario', texto: 'hola' }],
};

const OK = {
  texto: 'respuesta',
  uso: { tokensEntrada: 1000, tokensSalida: 500, tokensCache: 0 },
};

function http(estado: number, clase: 'reintentable' | 'no-reintentable'): AdaptadorLlmError {
  return new AdaptadorLlmError(clase, 'http', estado);
}

function crearGateway(sobrescribir: Partial<ConfigGatewayLlm> = {}) {
  const clock = new ClockFalso(INICIO);
  const adaptador = new FakeAdaptadorLlm(clock);
  const uso = new RepositorioUsoLlmEnMemoria();
  const temporizador = new TemporizadorLlmFalso(clock);
  const configuracion: ConfigGatewayLlm = {
    ...CONFIGURACION_LLM_DE_PRUEBA,
    NODE_ENV: 'test',
    LOCK_TURNO_TTL_S: 30,
    ...sobrescribir,
  };
  const gateway = new LlmGateway(adaptador, uso, temporizador, configuracion, clock);
  return { gateway, adaptador, uso, temporizador, clock };
}

async function fallo(promesa: Promise<unknown>): Promise<ErrorPasarelaLlm> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof ErrorPasarelaLlm) {
      return error;
    }
    throw error;
  }
  throw new Error('La generación debía fallar con ErrorPasarelaLlm');
}

describe('modulos/llm/aplicacion — LlmGateway v1: éxito y registro (LLM6 base)', () => {
  it('llama al primer modelo del perfil y registra la fila con costo y latencia calculados', async () => {
    const { gateway, adaptador, uso } = crearGateway();
    const metadatos = { referencia: 'opaca' };
    adaptador.programar(MODELO, { resultado: { ...OK, metadatos }, tardaMs: 120 });

    const respuesta = await gateway.generar({ ...SOLICITUD, conversacionId: 'conv-1' });

    expect(respuesta.texto).toBe('respuesta');
    expect(respuesta.uso).toEqual(OK.uso);
    expect(respuesta.metadatosProveedor).toBe(metadatos);
    expect(adaptador.llamadas).toHaveLength(1);
    expect(adaptador.llamadas[0]?.modelo).toBe(MODELO);
    expect(adaptador.llamadas[0]?.limite.maxTokens).toBe(400);
    expect(uso.filas).toEqual([
      {
        proveedor: 'openrouter',
        modelo: MODELO,
        tokensEntrada: 1000,
        tokensSalida: 500,
        tokensCache: 0,
        costoEstimadoUsd: 0.0008,
        latenciaMs: 120,
        exito: true,
        conversacionId: 'conv-1',
      },
    ]);
  });

  it('el perfil evals usa sus propios modelos y su propio tope de tokens', async () => {
    const { gateway, adaptador } = crearGateway({
      LLM_EVALS_MODELOS: ['openai/gpt-5.6-luna', 'otro/modelo'],
      LLM_EVALS_MAX_TOKENS: 123,
    });
    adaptador.programar(MODELO, { resultado: OK });

    await gateway.generar({ ...SOLICITUD, perfil: 'evals' });

    expect(adaptador.llamadas[0]?.modelo).toBe(MODELO);
    expect(adaptador.llamadas[0]?.limite.maxTokens).toBe(123);
  });

  it('un modelo sin precio registra costo cero y avisa sin tumbar la respuesta (D6)', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { gateway, adaptador, uso } = crearGateway({ LLM_CONVERSACION_MODELOS: ['sin/precio'] });
    adaptador.programar('sin/precio', { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(uso.filas[0]?.costoEstimadoUsd).toBe(0);
    expect(aviso).toHaveBeenCalledWith({ evento: 'llm.precio-desconocido', modelo: 'sin/precio' });
    aviso.mockRestore();
  });

  it('separa las llamadas de herramienta válidas de las inválidas sin corregirlas (D13)', async () => {
    const esquema = z.object({ consulta: z.string() });
    const buena = { id: 'c1', nombre: 'buscar', argumentos: { consulta: 'reloj' } };
    const mala = { id: 'c2', nombre: 'buscar', argumentos: { consulta: 7 } };
    const { gateway, adaptador } = crearGateway();
    adaptador.programar(MODELO, { resultado: { ...OK, llamadas: [buena, mala] } });

    const respuesta = await gateway.generar({
      ...SOLICITUD,
      herramientas: [
        { nombre: 'buscar', descripcion: 'Busca', esquema, esquemaJson: z.toJSONSchema(esquema) },
      ],
    });

    expect(respuesta.llamadasHerramienta).toEqual([buena]);
    expect(respuesta.llamadasInvalidas).toHaveLength(1);
    expect(respuesta.llamadasInvalidas?.[0]?.llamada).toBe(mala);
    expect(respuesta.llamadasInvalidas?.[0]?.causa).toContain('consulta');
  });
});

describe('modulos/llm/aplicacion — LlmGateway v1: timeout (LLM3)', () => {
  it('LLM3 — Llamada que supera el timeout del perfil se aborta', async () => {
    const { gateway, adaptador, uso } = crearGateway({
      LLM_CONVERSACION_TIMEOUT_MS: 40,
      LLM_CONVERSACION_MAX_REINTENTOS: 0,
    });
    adaptador.programar(MODELO, { colgar: true });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('timeout');
    expect(error.modelo).toBe(MODELO);
    expect(adaptador.llamadas).toHaveLength(1);
    expect(adaptador.llamadas[0]?.limite.abort.aborted).toBe(true);
    expect(uso.filas).toHaveLength(1);
    expect(uso.filas[0]).toMatchObject({
      proveedor: 'openrouter',
      modelo: MODELO,
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
      costoEstimadoUsd: 0,
      exito: false,
    });
  });

  it('un timeout se reintenta como cualquier fallo reintentable (A7)', async () => {
    const { gateway, adaptador, uso, temporizador } = crearGateway({
      LLM_CONVERSACION_TIMEOUT_MS: 30,
    });
    adaptador.programar(MODELO, { colgar: true }, { colgar: true }, { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(adaptador.llamadas).toHaveLength(3);
    expect(temporizador.esperas).toHaveLength(2);
    expect(uso.filas.map((fila) => fila.exito)).toEqual([false, false, true]);
  });
});

describe('modulos/llm/aplicacion — LlmGateway v1: reintento acotado (LLM4, D4)', () => {
  it('LLM4 — Fallo reintentable se reintenta como máximo 2 veces', async () => {
    const { gateway, adaptador, uso, temporizador } = crearGateway();
    temporizador.azarFijo = 0.5;
    adaptador.programar(MODELO, { error: http(429, 'reintentable') }, { error: http(429, 'reintentable') }, {
      error: http(429, 'reintentable'),
    });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('proveedor-caido');
    expect(error.modelo).toBe(MODELO);
    expect(adaptador.llamadas).toHaveLength(3);
    expect(temporizador.esperas).toHaveLength(2);
    expect(temporizador.esperas[0]).toBeGreaterThanOrEqual(500);
    expect(temporizador.esperas[0]).toBeLessThanOrEqual(700);
    expect(temporizador.esperas[1]).toBeGreaterThanOrEqual(1000);
    expect(temporizador.esperas[1]).toBeLessThanOrEqual(1200);
    expect(uso.filas).toHaveLength(3);
    expect(uso.filas.every((fila) => !fila.exito)).toBe(true);
  });

  it('LLM4 — Error 4xx distinto de 429 no se reintenta contra el mismo modelo', async () => {
    const { gateway, adaptador, uso, temporizador } = crearGateway();
    adaptador.programar(MODELO, { error: http(400, 'no-reintentable') }, { resultado: OK });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('no-reintentable');
    expect(error.modelo).toBe(MODELO);
    expect(adaptador.llamadas).toHaveLength(1);
    expect(temporizador.esperas).toEqual([]);
    expect(uso.filas).toHaveLength(1);
    expect(uso.filas[0]?.exito).toBe(false);
  });

  it('un 5xx se reintenta y, si el segundo intento responde, entrega esa respuesta', async () => {
    const { gateway, adaptador, uso } = crearGateway();
    adaptador.programar(MODELO, { error: http(503, 'reintentable') }, { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(uso.filas.map((fila) => fila.exito)).toEqual([false, true]);
  });

  it('el backoff crece con el reintento, suma el jitter y respeta el máximo', async () => {
    const sinJitter = crearGateway();
    sinJitter.temporizador.azarFijo = 0;
    sinJitter.adaptador.programar(
      MODELO,
      { error: http(429, 'reintentable') },
      { error: http(429, 'reintentable') },
      { error: http(429, 'reintentable') },
    );
    const conJitterMaximo = crearGateway({ LLM_REINTENTO_MAX_MS: 1100 });
    conJitterMaximo.temporizador.azarFijo = 0.999;
    conJitterMaximo.adaptador.programar(
      MODELO,
      { error: http(429, 'reintentable') },
      { error: http(429, 'reintentable') },
      { error: http(429, 'reintentable') },
    );

    await fallo(sinJitter.gateway.generar(SOLICITUD));
    await fallo(conJitterMaximo.gateway.generar(SOLICITUD));

    expect(sinJitter.temporizador.esperas).toEqual([500, 1000]);
    expect(conJitterMaximo.temporizador.esperas[0]).toBeCloseTo(699.8, 1);
    expect(conJitterMaximo.temporizador.esperas[1]).toBe(1100);
  });

  it('con cero reintentos configurados hace un solo intento', async () => {
    const { gateway, adaptador } = crearGateway({ LLM_CONVERSACION_MAX_REINTENTOS: 0 });
    adaptador.programar(MODELO, { error: http(429, 'reintentable') }, { resultado: OK });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('proveedor-caido');
    expect(adaptador.llamadas).toHaveLength(1);
  });

  it('sin respuesta HTTP del proveedor tras los reintentos devuelve proveedor-caido', async () => {
    const { gateway, adaptador } = crearGateway();
    const sinRespuesta = new AdaptadorLlmError('reintentable', 'sin-respuesta');
    adaptador.programar(MODELO, { error: sinRespuesta }, { error: sinRespuesta }, { error: sinRespuesta });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('proveedor-caido');
    expect(adaptador.llamadas).toHaveLength(3);
  });

  it('un error que no viene clasificado por el adaptador se trata como no reintentable', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { gateway, adaptador } = crearGateway();
    adaptador.programar(MODELO, { error: new Error('contenido-que-no-debe-salir') }, { resultado: OK });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('no-reintentable');
    expect(adaptador.llamadas).toHaveLength(1);
    expect(JSON.stringify(aviso.mock.calls)).not.toContain('contenido-que-no-debe-salir');
    aviso.mockRestore();
  });
});

describe('modulos/llm/aplicacion — LlmGateway v1: presupuesto total derivado del lock (D3)', () => {
  const TIMEOUT = new AdaptadorLlmError('reintentable', 'timeout');

  it('el segundo intento recibe solo lo que queda del presupuesto y no se lanza un tercero', async () => {
    const { gateway, adaptador, temporizador } = crearGateway();
    adaptador.programar(
      MODELO,
      { error: TIMEOUT, tardaMs: 15_000 },
      { error: TIMEOUT, tardaMs: 9_500 },
      { resultado: OK },
    );

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('timeout');
    expect(adaptador.llamadas).toHaveLength(2);
    expect(temporizador.programaciones).toEqual([15_000, 9_500]);
    expect(temporizador.esperas).toEqual([500]);
  });

  it('no reintenta cuando al presupuesto le quedan 2 segundos o menos', async () => {
    const { gateway, adaptador, temporizador } = crearGateway();
    adaptador.programar(MODELO, { error: TIMEOUT, tardaMs: 23_000 }, { resultado: OK });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('timeout');
    expect(adaptador.llamadas).toHaveLength(1);
    expect(temporizador.esperas).toEqual([]);
  });

  it('con un fallo rápido conserva el timeout completo del perfil en el segundo intento', async () => {
    const { gateway, adaptador, temporizador } = crearGateway();
    adaptador.programar(
      MODELO,
      { error: http(429, 'reintentable'), tardaMs: 300 },
      { resultado: OK },
    );

    await gateway.generar(SOLICITUD);

    expect(temporizador.programaciones).toEqual([15_000, 15_000]);
  });
});
