/**
 * Evals del agente (Fase 07c, D1-D7): cada caso llama al generador del turno de la aplicación real
 * (`MotorTurno` → políticas → `ContenidoLlm` → bucle → herramientas reales sobre la base de prueba) con
 * el LLM que corresponda al modo. En modo guionado (por defecto) el LLM es un `FakePuertoLlm` alimentado
 * por el guion del caso: sin red ni costo y con resultados idénticos en cada corrida (EVL1).
 */
import path from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GENERADOR_RESPUESTA, type GeneradorRespuesta } from '../../src/modulos/conversaciones/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { FakePuertoLlm } from '../fakes/puerto-llm-falso.js';
import { SimuladorOpenRouter } from '../soporte/simulador-openrouter.js';
import { componerAgente } from './soporte/componer-agente.js';
import { cargarCasos } from './soporte/esquema-caso.js';
import { GrabadorLlm } from './soporte/grabador-llm.js';
import { leerModoEvals } from './soporte/modo-evals.js';
import { ejecutarCaso } from './soporte/ejecutar-caso.js';
import { armarResumen, type CasoResumen } from './soporte/resumen.js';
import { sembrarBase } from './soporte/sembrar.js';
import { calcularVeredicto } from './soporte/umbral.js';

// Falla aquí, antes de componer nada, si se pidió el modo real sin clave o en CI (EVL4).
const modo = leerModoEvals(process.env);
const CARPETA_CASOS = path.resolve(import.meta.dirname, 'casos');
const sinteticos = cargarCasos(path.join(CARPETA_CASOS, 'sinteticos'));
const negativos = cargarCasos(path.join(CARPETA_CASOS, 'sinteticos', 'negativos'));

describe('Evals del agente — casos sintéticos (modo guionado)', () => {
  const simulador = { valor: undefined as SimuladorOpenRouter | undefined };
  const grabador = new GrabadorLlm(new FakePuertoLlm());
  let contexto: INestApplicationContext;
  let generador: GeneradorRespuesta;
  let prisma: PrismaService;
  const resumenes: CasoResumen[] = [];

  beforeAll(async () => {
    simulador.valor = await SimuladorOpenRouter.iniciar();
    contexto = await componerAgente({ llm: grabador, urlOpenRouter: simulador.valor.url });
    generador = contexto.get<GeneradorRespuesta>(GENERADOR_RESPUESTA);
    prisma = contexto.get(PrismaService);
    await sembrarBase(prisma);
  });

  afterAll(async () => {
    await contexto.close();
    await simulador.valor?.cerrar();
  });

  for (const caso of sinteticos) {
    it(caso.titulo, async () => {
      const resultados = await ejecutarCaso({ caso: caso, generador, grabador, prisma });
      resumenes.push({ id: caso.id, titulo: caso.titulo, resultados });
      for (const resultado of resultados) {
        expect(resultado.ok, `${caso.id}: ${resultado.nombre} — ${resultado.detalle}`).toBe(true);
      }
    });
  }

  for (const caso of negativos) {
    it(caso.titulo, async () => {
      const resultados = await ejecutarCaso({ caso, generador, grabador, prisma });
      const esperada = resultados.find((resultado) => resultado.nombre === caso.esperaFallo);
      expect(esperada, `${caso.id}: el caso no declara la aserción ${String(caso.esperaFallo)}`).toBeDefined();
      // Si la aserción pasa, no detecta la violación: el negativo falla nombrando el caso (EVL2).
      expect(esperada?.ok, `${caso.id}: la aserción ${String(caso.esperaFallo)} no detectó la violación`).toBe(false);
    });
  }

  it('EVL1 — El modo guionado no llama a ningún proveedor', async () => {
    expect(modo.modo).toBe('guionado');
    expect(simulador.valor?.intentos).toBe(0);
    expect(await prisma.usoLlm.count()).toBe(0);
  });

  it('EVL3 — veredicto de la corrida guionada', () => {
    const veredicto = calcularVeredicto(resumenes.flatMap((caso) => caso.resultados), 'guionado');
    // Se imprime el resumen (sin tiempos ni texto de clientes) para el registro de la corrida.
    process.stdout.write(`${armarResumen(resumenes, veredicto, 'guionado')}\n`);
    expect(veredicto.aprobada).toBe(true);
  });

  it('EVL1 — Dos corridas guionadas dan el mismo resultado', async () => {
    const [saludo] = sinteticos;
    if (saludo === undefined) throw new Error('falta el caso saludo');

    const resumenDeUnaCorrida = async (): Promise<string> => {
      const resultados = await ejecutarCaso({ caso: saludo, generador, grabador, prisma });
      return armarResumen([{ id: saludo.id, titulo: saludo.titulo, resultados }], calcularVeredicto(resultados, 'guionado'), 'guionado');
    };

    expect(await resumenDeUnaCorrida()).toBe(await resumenDeUnaCorrida());
  });
});
