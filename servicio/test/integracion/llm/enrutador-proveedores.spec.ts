import { Logger } from '@nestjs/common';

import { LlmGateway } from '../../../src/modulos/llm/aplicacion/llm-gateway.js';
import type { ConfigGatewayLlm } from '../../../src/modulos/llm/aplicacion/config-gateway-llm.js';
import { AdaptadorEnrutador } from '../../../src/modulos/llm/infraestructura/adaptador-enrutador.js';
import { crearProveedorOpenAi } from '../../../src/modulos/llm/infraestructura/proveedores/openai.js';
import { crearProveedorOpenRouter } from '../../../src/modulos/llm/infraestructura/proveedores/openrouter.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { RepositorioParametroLlmEnMemoria } from '../../fakes/repositorio-parametro-llm-en-memoria.js';
import { RepositorioUsoLlmEnMemoria } from '../../fakes/repositorio-uso-llm-en-memoria.js';
import { TemporizadorLlmFalso } from '../../fakes/temporizador-llm-falso.js';
import { SimuladorOpenAi } from '../../soporte/simulador-openai.js';
import { SimuladorOpenRouter } from '../../soporte/simulador-openrouter.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

// T8 (proveedores-llm-configurables): el enrutador y el gateway reales contra un servidor local por
// proveedor. Prueba de punta a punta LLM15, LLM19 y LLM21 sin claves reales ni gasto.

const DIRECTO = 'openai:gpt-6-luna';
const OPENROUTER = 'openai/gpt-5.6-luna';
const PRECIO = { entrada: 1, salida: 2, cache: 0.5 };

describe('llm — enrutador de proveedores con el gateway (LLM15, LLM19, LLM21)', () => {
  let openai: SimuladorOpenAi;
  let openrouter: SimuladorOpenRouter;

  beforeAll(async () => {
    Logger.overrideLogger(false);
    openai = await SimuladorOpenAi.iniciar();
    openrouter = await SimuladorOpenRouter.iniciar();
  });

  afterAll(async () => {
    await openai.cerrar();
    await openrouter.cerrar();
  });

  function crear(modelos: string[]) {
    const clock = new ClockFalso(new Date('2026-09-30T12:00:00.000Z'));
    const uso = new RepositorioUsoLlmEnMemoria();
    const adaptador = new AdaptadorEnrutador([
      crearProveedorOpenRouter({ OPENROUTER_API_KEY: 'clave-or', OPENROUTER_BASE_URL: openrouter.url }),
      crearProveedorOpenAi({ OPENAI_API_KEY: 'clave-oa' }, { baseURL: openai.url }),
    ]);
    const configuracion: ConfigGatewayLlm = {
      ...CONFIGURACION_AGENTE_DE_PRUEBA,
      ...CONFIGURACION_LLM_DE_PRUEBA,
      NODE_ENV: 'test',
      LOCK_TURNO_TTL_S: 30,
      LLM_CONVERSACION_MODELOS: modelos,
      LLM_CONVERSACION_MAX_REINTENTOS: 0,
      LLM_PRECIOS_USD_JSON: Object.fromEntries(modelos.map((modelo) => [modelo, PRECIO])),
    };
    const gateway = new LlmGateway(
      adaptador,
      uso,
      new RepositorioParametroLlmEnMemoria(),
      new TemporizadorLlmFalso(clock),
      configuracion,
      clock,
    );
    return { gateway, uso };
  }

  const SOLICITUD = {
    perfil: 'conversacion' as const,
    mensajes: [{ rol: 'usuario' as const, texto: 'hola' }],
  };

  it('LLM15 — Un id con prefijo se llama directo al proveedor y LLM19 costea con el id configurado', async () => {
    openai.responderTexto('desde openai', { tokensEntrada: 1000, tokensSalida: 500, tokensCache: 400 });
    const antes = openrouter.intentos;
    const { gateway, uso } = crear([DIRECTO]);

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('desde openai');
    expect(openai.ultima().cuerpo.model).toBe('gpt-6-luna');
    expect(openrouter.intentos).toBe(antes);
    // (600 * 1 + 500 * 2 + 400 * 0.5) / 1e6
    expect(uso.filas).toEqual([
      expect.objectContaining({
        proveedor: 'openai',
        modelo: DIRECTO,
        tokensEntrada: 600,
        tokensSalida: 500,
        tokensCache: 400,
        costoEstimadoUsd: 0.0018,
        exito: true,
      }),
    ]);
  });

  it('LLM21 — La caída de un proveedor deriva al modelo de otro proveedor', async () => {
    openai.responderError(503);
    openrouter.responderTexto('desde openrouter', { tokensEntrada: 10, tokensSalida: 5 });
    const { gateway, uso } = crear([DIRECTO, OPENROUTER]);

    const respuesta = await gateway.generar(SOLICITUD);

    expect(respuesta.texto).toBe('desde openrouter');
    expect(openrouter.ultimoCuerpo().model).toBe(OPENROUTER);
    expect(uso.filas.map((fila) => [fila.proveedor, fila.exito])).toEqual([
      ['openai', false],
      ['openrouter', true],
    ]);
  });
});
