import { readFileSync } from 'node:fs';
import { Logger, type LoggerService } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { LLM_PORT, LlmModule, type LlmPort } from '../../../src/modulos/llm/index.js';
import type { SolicitudGeneracion } from '../../../src/modulos/llm/puertos/llm-port.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  cargarConfiguracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RelojModule } from '../../../src/plataforma/reloj/index.js';
import { SimuladorOpenRouter } from '../../soporte/simulador-openrouter.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T9 (fase-06-pasarela-llm): el módulo `llm` compuesto de punta a punta contra el simulador de
// OpenRouter y Postgres real. LLM10 (R14) y LLM12 (R15) son los escenarios primarios.

const PROMPT = 'PROMPT-SECRETO-XYZ';
const TELEFONO = '3001234567';
const CORREO = 'cliente-real@correo.com';
const CEDULA = '1020304050';
const RESPUESTA = 'RESPUESTA-SECRETA-ABC';
const CONTENIDO_SENSIBLE = [PROMPT, TELEFONO, CORREO, CEDULA, RESPUESTA, 'ARGUMENTO-SECRETO'];

const PRECIOS = JSON.stringify({
  'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 },
  'modelo/uno': { entrada: 0.1, salida: 0.5, cache: 0.01 },
  'modelo/dos': { entrada: 0.3, salida: 1.5, cache: 0.03 },
});

const SOLICITUD: SolicitudGeneracion = {
  perfil: 'conversacion',
  systemPrompt: PROMPT,
  mensajes: [{ rol: 'usuario', texto: `Mi teléfono es ${TELEFONO}, mi correo ${CORREO}, cédula ${CEDULA}` }],
};

class LoggerCapturado implements LoggerService {
  readonly lineas: string[] = [];
  log(mensaje: unknown, ...resto: unknown[]) {
    this.lineas.push(JSON.stringify([mensaje, ...resto]));
  }
  error(mensaje: unknown, ...resto: unknown[]) {
    this.lineas.push(JSON.stringify([mensaje, ...resto]));
  }
  warn(mensaje: unknown, ...resto: unknown[]) {
    this.lineas.push(JSON.stringify([mensaje, ...resto]));
  }
  debug(mensaje: unknown, ...resto: unknown[]) {
    this.lineas.push(JSON.stringify([mensaje, ...resto]));
  }
  verbose(mensaje: unknown, ...resto: unknown[]) {
    this.lineas.push(JSON.stringify([mensaje, ...resto]));
  }
  fatal(mensaje: unknown, ...resto: unknown[]) {
    this.lineas.push(JSON.stringify([mensaje, ...resto]));
  }
}

describe('llm — módulo compuesto (T9, integración)', () => {
  let simulador: SimuladorOpenRouter;
  let modulo: TestingModule | undefined;

  beforeAll(async () => {
    simulador = await SimuladorOpenRouter.iniciar();
  });

  afterAll(async () => {
    await simulador.cerrar();
  });

  afterEach(async () => {
    Logger.overrideLogger(false);
    await modulo?.close();
    modulo = undefined;
  });

  // `compile()` reemplaza el logger de Nest por uno propio de testing: el capturado se instala después.
  async function compilar(entorno: Record<string, string> = {}, logger?: LoggerService) {
    const configuracion = cargarConfiguracion({
      NODE_ENV: 'development',
      DATABASE_URL: urlPostgresDePrueba(),
      REDIS_URL: urlRedisDePrueba(),
      OPENROUTER_API_KEY: 'clave-de-prueba',
      OPENROUTER_BASE_URL: simulador.url,
      LLM_PRECIOS_USD_JSON: PRECIOS,
      LLM_REINTENTO_BASE_MS: '1',
      LLM_REINTENTO_MAX_MS: '1',
      ...entorno,
    });
    modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RelojModule, LlmModule] })
      .overrideProvider(CONFIGURACION)
      .useValue(configuracion)
      .compile();
    if (logger !== undefined) {
      Logger.overrideLogger(logger);
    }
    const prisma = modulo.get(PrismaService);
    await prisma.usoLlm.deleteMany();
    await prisma.parametro.deleteMany({ where: { clave: 'llm_estado_techo' } });
    return { llm: modulo.get<LlmPort>(LLM_PORT), prisma };
  }

  it('LLM10 — Logs del gateway nunca contienen prompts, respuestas ni PII', async () => {
    const capturado = new LoggerCapturado();
    const { llm, prisma } = await compilar({ LLM_CONVERSACION_MAX_REINTENTOS: '0' }, capturado);
    const gastar = (costo: string) =>
      prisma.usoLlm.create({
        data: {
          proveedor: 'openrouter',
          modelo: 'openai/gpt-5.6-luna',
          tokensEntrada: 1,
          tokensSalida: 1,
          tokensCache: 0,
          costoEstimadoUsd: costo,
          latenciaMs: 1,
          exito: true,
        },
      });

    simulador.responderTexto(RESPUESTA, { tokensEntrada: 40, tokensSalida: 10 });
    await llm.generar(SOLICITUD);
    simulador.responderLlamadas(
      [{ id: 'c1', nombre: 'buscar', argumentos: '{"consulta":"ARGUMENTO-SECRETO"}' }],
      { tokensEntrada: 5, tokensSalida: 5 },
    );
    await llm.generar(SOLICITUD);
    simulador.responderError(503, `error del proveedor con ${TELEFONO} y ${CORREO}`);
    await llm.generar(SOLICITUD).catch(() => undefined);
    await gastar('8.500000');
    simulador.responderTexto(RESPUESTA, { tokensEntrada: 1, tokensSalida: 1 });
    await llm.generar(SOLICITUD);
    await gastar('5.000000');
    await llm.generar(SOLICITUD).catch(() => undefined);

    const eventos = capturado.lineas.join('\n');
    expect(eventos).toContain('llm.fallo');
    expect(eventos).toContain('llm.techo-aviso');
    for (const sensible of CONTENIDO_SENSIBLE) {
      expect(eventos).not.toContain(sensible);
    }
  });

  it('LLM10 — uso_llm guarda conteos y metadatos, nunca contenido', async () => {
    const { llm, prisma } = await compilar();
    simulador.responderTexto(RESPUESTA, { tokensEntrada: 1000, tokensSalida: 500 });

    await llm.generar(SOLICITUD);

    const filas = await prisma.usoLlm.findMany();
    expect(filas).toHaveLength(1);
    expect(Object.keys(filas[0] ?? {}).sort()).toEqual(
      [
        'conversacionId',
        'costoEstimadoUsd',
        'creado',
        'exito',
        'id',
        'latenciaMs',
        'modelo',
        'proveedor',
        'tokensCache',
        'tokensEntrada',
        'tokensSalida',
      ].sort(),
    );
    expect(filas[0]).toMatchObject({ modelo: 'openai/gpt-5.6-luna', tokensEntrada: 1000, exito: true });
    expect(filas[0]?.costoEstimadoUsd.toString()).toBe('0.0008');
    const guardado = JSON.stringify(filas);
    for (const sensible of CONTENIDO_SENSIBLE) {
      expect(guardado).not.toContain(sensible);
    }
  });

  it('LLM12 — Misma conversación contra 2 modelos cambiando solo configuración', async () => {
    const solicitud: SolicitudGeneracion = { ...SOLICITUD, mensajes: [{ rol: 'usuario', texto: 'hola' }] };
    const usados: string[] = [];
    const respuestas = [];

    for (const modelo of ['modelo/uno', 'modelo/dos']) {
      const { llm, prisma } = await compilar({
        LLM_CONVERSACION_MODELOS: modelo,
        LLM_PRECIOS_USD_JSON: PRECIOS,
      });
      simulador.responderTexto(`respuesta de ${modelo}`, { tokensEntrada: 100, tokensSalida: 20 });

      respuestas.push(await llm.generar(solicitud));

      usados.push(simulador.ultimoCuerpo().model);
      expect((await prisma.usoLlm.findMany()).map((fila) => fila.modelo)).toEqual([modelo]);
      await modulo?.close();
      modulo = undefined;
    }

    expect(usados).toEqual(['modelo/uno', 'modelo/dos']);
    expect(respuestas.map((respuesta) => respuesta.texto)).toEqual([
      'respuesta de modelo/uno',
      'respuesta de modelo/dos',
    ]);
    expect(respuestas.every((respuesta) => respuesta.uso?.tokensEntrada === 100)).toBe(true);
  });

  it('LlmModule no se registra en AppModule y GENERADOR_RESPUESTA sigue ligado a AgenteEco', () => {
    const appModule = readFileSync('src/app.module.ts', 'utf8');
    const conversaciones = readFileSync('src/modulos/conversaciones/conversaciones.module.ts', 'utf8');

    expect(appModule).not.toContain('LlmModule');
    expect(appModule).not.toContain('modulos/llm');
    expect(conversaciones).toContain('{ provide: GENERADOR_RESPUESTA, useClass: AgenteEco }');
    expect(conversaciones).not.toContain('modulos/llm');
  });
});
