import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { FakeAdaptadorLlm } from '../../../../test/fakes/adaptador-llm-falso.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { RepositorioParametroLlmEnMemoria } from '../../../../test/fakes/repositorio-parametro-llm-en-memoria.js';
import { RepositorioUsoLlmEnMemoria } from '../../../../test/fakes/repositorio-uso-llm-en-memoria.js';
import { TemporizadorLlmFalso } from '../../../../test/fakes/temporizador-llm-falso.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../../../test/soporte/configuracion-llm-de-prueba.js';
import { ErrorPasarelaLlm } from '../dominio/error-pasarela-llm.js';
import type { SolicitudGeneracion } from '../dominio/tipos-llm.js';
import { AdaptadorLlmError } from '../puertos/adaptador-llm.js';
import type { UltimoRecursoLlm } from '../puertos/ultimo-recurso-llm.js';
import type { ConfigGatewayLlm } from './config-gateway-llm.js';
import { LlmGateway } from './llm-gateway.js';

// Escenarios LLM1, LLM3, LLM4 y LLM5 de `openspec/changes/fase-06-pasarela-llm/specs/llm/spec.md`.
// Las primeras suites cubren el camino de un solo modelo (T4); las de fallback y circuito, T5.

const MODELO = 'openai/gpt-5.6-luna';
const MODELO_A = 'modelo/a';
const MODELO_B = 'modelo/b';
const PRECIO = { entrada: 0.2, salida: 1.2, cache: 0.02 };
const DOS_MODELOS: Partial<ConfigGatewayLlm> = {
  LLM_CONVERSACION_MODELOS: [MODELO_A, MODELO_B],
  LLM_PRECIOS_USD_JSON: { [MODELO_A]: PRECIO, [MODELO_B]: PRECIO },
};
const UN_MODELO_SIN_REINTENTOS: Partial<ConfigGatewayLlm> = {
  LLM_CONVERSACION_MODELOS: [MODELO_A],
  LLM_CONVERSACION_MAX_REINTENTOS: 0,
  LLM_PRECIOS_USD_JSON: { [MODELO_A]: PRECIO },
};
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

function crearGateway(
  sobrescribir: Partial<ConfigGatewayLlm> = {},
  ultimoRecurso?: UltimoRecursoLlm,
) {
  const clock = new ClockFalso(INICIO);
  const adaptador = new FakeAdaptadorLlm(clock);
  const uso = new RepositorioUsoLlmEnMemoria();
  const parametros = new RepositorioParametroLlmEnMemoria();
  const temporizador = new TemporizadorLlmFalso(clock);
  const configuracion: ConfigGatewayLlm = {
    ...CONFIGURACION_LLM_DE_PRUEBA,
    NODE_ENV: 'test',
    LOCK_TURNO_TTL_S: 30,
    ...sobrescribir,
  };
  const gateway = new LlmGateway(
    adaptador,
    uso,
    parametros,
    temporizador,
    configuracion,
    clock,
    ultimoRecurso,
  );
  return { gateway, adaptador, uso, parametros, temporizador, clock };
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

describe('modulos/llm/aplicacion — LlmGateway v2: fallback nivel 1 iterado (LLM5, ADR-0014)', () => {
  it('LLM5 — Caída del primer modelo deriva al siguiente sin intervención del llamador', async () => {
    const { gateway, adaptador, uso } = crearGateway({
      ...DOS_MODELOS,
      LLM_CONVERSACION_MAX_REINTENTOS: 0,
    });
    adaptador.programar(MODELO_A, { error: http(503, 'reintentable') });
    adaptador.programar(MODELO_B, { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(adaptador.llamadas.map((llamada) => llamada.modelo)).toEqual([MODELO_A, MODELO_B]);
    expect(adaptador.llamadas[1]?.solicitud).toBe(SOLICITUD);
    expect(uso.filas.map((fila) => [fila.modelo, fila.exito])).toEqual([
      [MODELO_A, false],
      [MODELO_B, true],
    ]);
  });

  it('agota los reintentos del primer modelo antes de pasar al siguiente', async () => {
    const { gateway, adaptador } = crearGateway(DOS_MODELOS);
    adaptador.programar(
      MODELO_A,
      { error: http(503, 'reintentable') },
      { error: http(503, 'reintentable') },
      { error: http(503, 'reintentable') },
    );
    adaptador.programar(MODELO_B, { resultado: OK });

    await gateway.generar(SOLICITUD);

    expect(adaptador.llamadas.map((llamada) => llamada.modelo)).toEqual([
      MODELO_A,
      MODELO_A,
      MODELO_A,
      MODELO_B,
    ]);
  });

  it('un 4xx no reintentable del primer modelo pasa directo al siguiente', async () => {
    const { gateway, adaptador, temporizador } = crearGateway(DOS_MODELOS);
    adaptador.programar(MODELO_A, { error: http(400, 'no-reintentable') });
    adaptador.programar(MODELO_B, { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(adaptador.llamadas.map((llamada) => llamada.modelo)).toEqual([MODELO_A, MODELO_B]);
    expect(temporizador.esperas).toEqual([]);
  });

  it('el presupuesto total se comparte entre modelos: sin margen no se prueba el siguiente', async () => {
    const { gateway, adaptador } = crearGateway(DOS_MODELOS);
    adaptador.programar(MODELO_A, { error: new AdaptadorLlmError('reintentable', 'timeout'), tardaMs: 24_000 });
    adaptador.programar(MODELO_B, { resultado: OK });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('timeout');
    expect(adaptador.llamadas.map((llamada) => llamada.modelo)).toEqual([MODELO_A]);
  });
});

describe('modulos/llm/aplicacion — LlmGateway v2: circuit breaker por modelo (LLM5, D5, ADR-0013)', () => {
  async function abrirCircuito(
    gateway: LlmGateway,
    adaptador: FakeAdaptadorLlm,
    modelo: string,
    fallos: number,
  ) {
    for (let i = 0; i < fallos; i += 1) {
      adaptador.programar(modelo, { error: http(503, 'reintentable') });
      await fallo(gateway.generar(SOLICITUD));
    }
  }

  it('LLM5 — Circuito abierto evita llamar al modelo en fallo sostenido', async () => {
    const { gateway, adaptador, uso, clock } = crearGateway(UN_MODELO_SIN_REINTENTOS);
    await abrirCircuito(gateway, adaptador, MODELO_A, 5);
    const llamadasAntes = adaptador.llamadas.length;
    clock.avanzar(59_999);

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('circuito-abierto');
    expect(adaptador.llamadas).toHaveLength(llamadasAntes);
    expect(uso.filas.at(-1)).toMatchObject({
      proveedor: 'pasarela',
      modelo: 'circuito-abierto',
      tokensEntrada: 0,
      costoEstimadoUsd: 0,
      exito: false,
    });

    clock.avanzar(1);
    adaptador.programar(MODELO_A, { resultado: OK });
    const sonda = await gateway.generar(SOLICITUD);

    expect(sonda.texto).toBe('respuesta');
    expect(adaptador.llamadas).toHaveLength(llamadasAntes + 1);
  });

  it('con un modelo abierto salta al siguiente del perfil sin llamar al abierto', async () => {
    const { gateway, adaptador } = crearGateway({
      ...DOS_MODELOS,
      LLM_CONVERSACION_MAX_REINTENTOS: 0,
    });
    for (let i = 0; i < 5; i += 1) {
      adaptador.programar(MODELO_A, { error: http(503, 'reintentable') });
      adaptador.programar(MODELO_B, { resultado: OK });
      await gateway.generar(SOLICITUD);
    }
    const llamadasAntes = adaptador.llamadas.length;
    adaptador.programar(MODELO_B, { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(adaptador.llamadas.slice(llamadasAntes).map((llamada) => llamada.modelo)).toEqual([
      MODELO_B,
    ]);
  });

  it('una sonda fallida reabre el circuito y la siguiente solicitud no llama al proveedor', async () => {
    const { gateway, adaptador, clock } = crearGateway(UN_MODELO_SIN_REINTENTOS);
    await abrirCircuito(gateway, adaptador, MODELO_A, 5);
    clock.avanzar(60_000);
    adaptador.programar(MODELO_A, { error: http(503, 'reintentable') });
    await fallo(gateway.generar(SOLICITUD));
    const llamadasAntes = adaptador.llamadas.length;

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('circuito-abierto');
    expect(adaptador.llamadas).toHaveLength(llamadasAntes);
  });

  it('un 4xx no reintentable no cuenta como fallo del proveedor y no abre el circuito', async () => {
    const { gateway, adaptador } = crearGateway(UN_MODELO_SIN_REINTENTOS);
    for (let i = 0; i < 6; i += 1) {
      adaptador.programar(MODELO_A, { error: http(400, 'no-reintentable') });
      const error = await fallo(gateway.generar(SOLICITUD));
      expect(error.codigo).toBe('no-reintentable');
    }

    expect(adaptador.llamadas).toHaveLength(6);
  });

  it('un éxito reinicia la cuenta: cuatro fallos, un éxito y cuatro fallos más no abren el circuito', async () => {
    const { gateway, adaptador } = crearGateway(UN_MODELO_SIN_REINTENTOS);
    await abrirCircuito(gateway, adaptador, MODELO_A, 4);
    adaptador.programar(MODELO_A, { resultado: OK });
    await gateway.generar(SOLICITUD);
    await abrirCircuito(gateway, adaptador, MODELO_A, 4);

    adaptador.programar(MODELO_A, { resultado: OK });
    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
  });

  it('el umbral de fallos y la ventana salen de la configuración', async () => {
    const { gateway, adaptador, clock } = crearGateway({
      ...UN_MODELO_SIN_REINTENTOS,
      LLM_CB_UMBRAL_FALLOS: 2,
      LLM_CB_VENTANA_S: 10,
    });
    await abrirCircuito(gateway, adaptador, MODELO_A, 2);

    const cerrado = await fallo(gateway.generar(SOLICITUD));
    clock.avanzar(10_000);
    adaptador.programar(MODELO_A, { resultado: OK });
    const sonda = await gateway.generar(SOLICITUD);

    expect(cerrado.codigo).toBe('circuito-abierto');
    expect(sonda.texto).toBe('respuesta');
  });
});

describe('modulos/llm/aplicacion — LlmGateway v2: error tipado y nivel 2 pospuesto (LLM1, LLM5, Q4)', () => {
  const SIN_RESPUESTA = new AdaptadorLlmError('reintentable', 'sin-respuesta');

  it('LLM5 — Caída total de OpenRouter devuelve error tipado sin proveedor directo', async () => {
    const { gateway, adaptador, uso } = crearGateway({
      ...DOS_MODELOS,
      LLM_CONVERSACION_MAX_REINTENTOS: 0,
    });
    adaptador.programar(MODELO_A, { error: SIN_RESPUESTA });
    adaptador.programar(MODELO_B, { error: SIN_RESPUESTA });

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.codigo).toBe('proveedor-caido');
    expect(error.modelo).toBe(MODELO_B);
    expect(adaptador.llamadas).toHaveLength(2);
    expect(uso.filas.map((fila) => fila.exito)).toEqual([false, false]);
  });

  it('el punto de extensión del último recurso solo se usa ante caída total y solo si existe', async () => {
    const respuestaDirecta = { texto: 'respuesta del último recurso' };
    const generarDirecto = vi.fn().mockResolvedValue(respuestaDirecta);
    const ultimoRecurso: UltimoRecursoLlm = { generar: generarDirecto };
    const con = crearGateway(UN_MODELO_SIN_REINTENTOS, ultimoRecurso);
    con.adaptador.programar(MODELO_A, { error: SIN_RESPUESTA });
    const sinCaida = crearGateway(UN_MODELO_SIN_REINTENTOS, ultimoRecurso);
    sinCaida.adaptador.programar(MODELO_A, { error: http(400, 'no-reintentable') });

    const respuesta = await con.gateway.generar(SOLICITUD);
    const errorSinCaida = await fallo(sinCaida.gateway.generar(SOLICITUD));

    expect(respuesta).toBe(respuestaDirecta);
    expect(generarDirecto).toHaveBeenCalledTimes(1);
    expect(generarDirecto).toHaveBeenCalledWith(SOLICITUD);
    expect(errorSinCaida.codigo).toBe('no-reintentable');
  });

  it('LLM1 — Error tipado distingue cada causa de fallo', async () => {
    const timeout = crearGateway({
      ...UN_MODELO_SIN_REINTENTOS,
      LLM_CONVERSACION_TIMEOUT_MS: 30,
    });
    timeout.adaptador.programar(MODELO_A, { colgar: true });
    const noReintentable = crearGateway(UN_MODELO_SIN_REINTENTOS);
    noReintentable.adaptador.programar(MODELO_A, { error: http(422, 'no-reintentable') });
    const abierto = crearGateway(UN_MODELO_SIN_REINTENTOS);
    for (let i = 0; i < 5; i += 1) {
      abierto.adaptador.programar(MODELO_A, { error: http(503, 'reintentable') });
      await fallo(abierto.gateway.generar(SOLICITUD));
    }
    const caido = crearGateway(UN_MODELO_SIN_REINTENTOS);
    caido.adaptador.programar(MODELO_A, { error: SIN_RESPUESTA });

    const codigos = [
      (await fallo(timeout.gateway.generar(SOLICITUD))).codigo,
      (await fallo(noReintentable.gateway.generar(SOLICITUD))).codigo,
      (await fallo(abierto.gateway.generar(SOLICITUD))).codigo,
      (await fallo(caido.gateway.generar(SOLICITUD))).codigo,
    ];

    expect(codigos).toEqual(['timeout', 'no-reintentable', 'circuito-abierto', 'proveedor-caido']);
  });

  it('con varios modelos el error refleja la última causa significativa, no la caída genérica', async () => {
    const config = { ...DOS_MODELOS, LLM_CONVERSACION_MAX_REINTENTOS: 0 };
    const casos: readonly (readonly [AdaptadorLlmError, AdaptadorLlmError, string])[] = [
      [new AdaptadorLlmError('reintentable', 'timeout'), http(400, 'no-reintentable'), 'no-reintentable'],
      [http(400, 'no-reintentable'), new AdaptadorLlmError('reintentable', 'timeout'), 'timeout'],
      [http(503, 'reintentable'), http(400, 'no-reintentable'), 'no-reintentable'],
      [http(503, 'reintentable'), http(429, 'reintentable'), 'proveedor-caido'],
    ];

    for (const [errorA, errorB, esperado] of casos) {
      const { gateway, adaptador } = crearGateway(config);
      adaptador.programar(MODELO_A, { error: errorA });
      adaptador.programar(MODELO_B, { error: errorB });

      const error = await fallo(gateway.generar(SOLICITUD));

      expect(error.codigo).toBe(esperado);
      expect(error.modelo).toBe(MODELO_B);
    }
  });
});

describe('modulos/llm/aplicacion — LlmGateway v3: techo mensual de gasto (LLM7-LLM9, D7, D9)', () => {
  // Techo 10 USD y aviso al 80 % (8 USD): valores aprobados en Q1 y Q2. `NODE_ENV=development`
  // porque en `test` el techo está desactivado (LLM7).
  const CON_TECHO: Partial<ConfigGatewayLlm> = { NODE_ENV: 'development' };

  it('LLM7 — Gasto bajo el techo permite la llamada con normalidad', async () => {
    const { gateway, adaptador, uso, parametros } = crearGateway(CON_TECHO);
    uso.gastoMensualUsd = 2;
    adaptador.programar(MODELO, { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(adaptador.llamadas).toHaveLength(1);
    expect(uso.filas).toHaveLength(1);
    expect(uso.filas[0]?.exito).toBe(true);
    expect(parametros.lecturasDeEstado).toBe(0);
    expect(uso.consultas.map((desde) => desde.toISOString())).toEqual(['2026-09-01T00:00:00.000Z']);
  });

  it('LLM7 — Techo desactivado en entorno de pruebas', async () => {
    const { gateway, adaptador, uso } = crearGateway({ NODE_ENV: 'test' });
    uso.gastoMensualUsd = 50;
    adaptador.programar(MODELO, { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(adaptador.llamadas).toHaveLength(1);
    expect(uso.consultas).toEqual([]);
  });

  it('LLM8 — Cruce del 80 % emite aviso warn una vez por mes', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { gateway, adaptador, uso, parametros, clock } = crearGateway(CON_TECHO);
    adaptador.programar(MODELO, { resultado: OK }, { resultado: OK }, { resultado: OK });
    const avisosDelTecho = () =>
      aviso.mock.calls.filter(([mensaje]) => (mensaje as { evento?: string }).evento === 'llm.techo-aviso');

    uso.gastoMensualUsd = 7.99;
    await gateway.generar(SOLICITUD);
    expect(avisosDelTecho()).toHaveLength(0);

    uso.gastoMensualUsd = 8.5;
    await gateway.generar(SOLICITUD);
    await gateway.generar(SOLICITUD);

    expect(avisosDelTecho()).toEqual([
      [{ evento: 'llm.techo-aviso', mes: '2026-09', gastoUsd: 8.5, techoUsd: 10 }],
    ]);
    expect(parametros.guardados).toEqual([
      { mes: '2026-09', gastoUsd: 8.5, techoUsd: 10, avisoEmitido: true, bloqueado: false },
    ]);

    clock.avanzar(5 * 24 * 60 * 60 * 1000);
    adaptador.programar(MODELO, { resultado: OK });
    await gateway.generar(SOLICITUD);

    expect(avisosDelTecho()).toHaveLength(2);
    expect(avisosDelTecho()[1]?.[0]).toMatchObject({ mes: '2026-10' });
    aviso.mockRestore();
  });

  it('el aviso del mes no se repite tras reiniciar el proceso porque el estado es durable', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const primero = crearGateway(CON_TECHO);
    primero.uso.gastoMensualUsd = 8.5;
    primero.adaptador.programar(MODELO, { resultado: OK });
    await primero.gateway.generar(SOLICITUD);
    const segundo = crearGateway(CON_TECHO);
    segundo.parametros.estado = primero.parametros.estado;
    segundo.uso.gastoMensualUsd = 8.7;
    segundo.adaptador.programar(MODELO, { resultado: OK });

    await segundo.gateway.generar(SOLICITUD);

    const avisos = aviso.mock.calls.filter(
      ([mensaje]) => (mensaje as { evento?: string }).evento === 'llm.techo-aviso',
    );
    expect(avisos).toHaveLength(1);
    expect(segundo.parametros.guardados).toEqual([]);
    aviso.mockRestore();
  });

  it('LLM9 — Gasto al 100 % no llama al LLM y devuelve techo-alcanzado', async () => {
    const { gateway, adaptador, uso, parametros } = crearGateway(CON_TECHO);
    uso.gastoMensualUsd = 10;
    adaptador.programar(MODELO, { resultado: OK });

    const error = await fallo(gateway.generar({ ...SOLICITUD, conversacionId: 'conv-1' }));

    expect(error.codigo).toBe('techo-alcanzado');
    expect(error.modelo).toBeUndefined();
    expect(adaptador.llamadas).toEqual([]);
    expect(uso.filas).toEqual([
      {
        proveedor: 'pasarela',
        modelo: 'techo-alcanzado',
        tokensEntrada: 0,
        tokensSalida: 0,
        tokensCache: 0,
        costoEstimadoUsd: 0,
        latenciaMs: 0,
        exito: false,
        conversacionId: 'conv-1',
      },
    ]);
    expect(parametros.estado).toEqual({
      mes: '2026-09',
      gastoUsd: 10,
      techoUsd: 10,
      avisoEmitido: true,
      bloqueado: true,
    });
  });

  it('justo por debajo del techo todavía llama y por encima bloquea cada solicitud sin repetir el estado', async () => {
    const { gateway, adaptador, uso, parametros } = crearGateway(CON_TECHO);
    uso.gastoMensualUsd = 9.999999;
    adaptador.programar(MODELO, { resultado: OK });
    await gateway.generar(SOLICITUD);
    uso.gastoMensualUsd = 10.5;

    const primera = await fallo(gateway.generar(SOLICITUD));
    const segunda = await fallo(gateway.generar(SOLICITUD));

    expect([primera.codigo, segunda.codigo]).toEqual(['techo-alcanzado', 'techo-alcanzado']);
    expect(adaptador.llamadas).toHaveLength(1);
    expect(uso.filas.filter((fila) => fila.modelo === 'techo-alcanzado')).toHaveLength(2);
    expect(parametros.guardados).toHaveLength(2);
  });

  it('un salto directo de menos del 80 % al 100 % avisa una sola vez y bloquea', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { gateway, uso, parametros } = crearGateway(CON_TECHO);
    uso.gastoMensualUsd = 12;

    await fallo(gateway.generar(SOLICITUD));

    const avisos = aviso.mock.calls.filter(
      ([mensaje]) => (mensaje as { evento?: string }).evento === 'llm.techo-aviso',
    );
    expect(avisos).toHaveLength(1);
    expect(parametros.guardados).toHaveLength(1);
    expect(parametros.guardados[0]).toMatchObject({ avisoEmitido: true, bloqueado: true });
    aviso.mockRestore();
  });

  it('el gateway nunca trae un texto propio para el techo: el mensaje lo lee otra fase del parámetro', async () => {
    const { gateway, uso, parametros } = crearGateway(CON_TECHO);
    uso.gastoMensualUsd = 10;

    const error = await fallo(gateway.generar(SOLICITUD));

    expect(error.message).toBe('Pasarela LLM: techo-alcanzado');
    expect(parametros.lecturasDeMensaje).toBe(0);
  });

  it('si no puede verificar el gasto avisa con un error y deja pasar la llamada', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { gateway, adaptador, uso } = crearGateway(CON_TECHO);
    uso.fallaElGasto = true;
    adaptador.programar(MODELO, { resultado: OK });

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('respuesta');
    expect(errorLog).toHaveBeenCalledWith({ evento: 'llm.techo-no-verificado', error: 'Error' });
    errorLog.mockRestore();
  });
});
