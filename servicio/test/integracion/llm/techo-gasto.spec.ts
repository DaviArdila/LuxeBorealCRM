import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { ObtenerMensajeTechoGasto } from '../../../src/modulos/llm/index.js';
import { LlmGateway } from '../../../src/modulos/llm/aplicacion/llm-gateway.js';
import { ErrorPasarelaLlm } from '../../../src/modulos/llm/dominio/error-pasarela-llm.js';
import { RepositorioParametroLlmPrisma } from '../../../src/modulos/llm/infraestructura/prisma/repositorio-parametro-llm-prisma.js';
import { RepositorioUsoLlmPrisma } from '../../../src/modulos/llm/infraestructura/prisma/repositorio-uso-llm-prisma.js';
import type { SolicitudGeneracion } from '../../../src/modulos/llm/puertos/llm-port.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  cargarConfiguracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { FakeAdaptadorLlm } from '../../fakes/adaptador-llm-falso.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { TemporizadorLlmFalso } from '../../fakes/temporizador-llm-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { fijarTextosDelSistema, limpiarCasos, textosSinCopia } from '../../soporte/textos-asistente.js';

// T8 (fase-06-pasarela-llm): techo mensual y parámetros de `llm` contra Postgres real (D7, D9, R15).

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

const MODELO = 'openai/gpt-5.6-luna';
const SOLICITUD: SolicitudGeneracion = {
  perfil: 'conversacion',
  mensajes: [{ rol: 'usuario', texto: 'hola' }],
};

async function preparar() {
  Logger.overrideLogger(false);
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'development',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
  });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const prisma = modulo.get(PrismaService);
  await prisma.usoLlm.deleteMany();
  await prisma.parametro.deleteMany({
    where: { clave: { in: ['llm_estado_techo', 'mensaje_techo_gasto', 'llm_techo_mensual_usd'] } },
  });
  const clock = new ClockFalso(new Date('2026-09-28T12:00:00.000Z'));
  const parametros = new RepositorioParametroLlmPrisma(prisma);
  const uso = new RepositorioUsoLlmPrisma(prisma);
  const crearGateway = (adaptador: FakeAdaptadorLlm) =>
    new LlmGateway(adaptador, uso, parametros, new TemporizadorLlmFalso(clock), configuracion, clock);
  return { prisma, clock, parametros, crearGateway };
}

async function gastar(prisma: PrismaService, costo: string, creado: string): Promise<void> {
  await prisma.usoLlm.create({
    data: {
      proveedor: 'openrouter',
      modelo: MODELO,
      tokensEntrada: 1,
      tokensSalida: 1,
      tokensCache: 0,
      costoEstimadoUsd: costo,
      latenciaMs: 10,
      exito: true,
      creado: new Date(creado),
    },
  });
}

describe('llm — techo de gasto y parámetros (T8, integración)', () => {
  it('LLM9 — Texto de derivación vive en el caso mensaje_techo_gasto del asistente', async () => {
    const { prisma } = await preparar();
    await limpiarCasos(prisma);
    const mensaje = new ObtenerMensajeTechoGasto(textosSinCopia(prisma));

    const porDefecto = await mensaje.ejecutar();
    await fijarTextosDelSistema(prisma, { mensaje_techo_gasto: 'Texto nuevo del negocio.' });
    const actualizado = await mensaje.ejecutar();
    await fijarTextosDelSistema(prisma, { mensaje_techo_gasto: '   ' });
    const enBlanco = await mensaje.ejecutar();
    await limpiarCasos(prisma);

    expect(porDefecto).toBe(
      'Gracias por escribirnos. En este momento te atiende directamente un asesor, que te responderá en breve.',
    );
    expect(actualizado).toBe('Texto nuevo del negocio.');
    expect(enBlanco).toBe(porDefecto);
  });

  it('el estado del techo se guarda y se lee de parametro sin perder ningún campo', async () => {
    const { prisma, parametros } = await preparar();
    const estado = { mes: '2026-09', gastoUsd: 8.5, techoUsd: 10, avisoEmitido: true, bloqueado: false };

    expect(await parametros.leerEstadoTecho()).toBeNull();
    await parametros.guardarEstadoTecho(estado);
    await parametros.guardarEstadoTecho({ ...estado, gastoUsd: 10.2, bloqueado: true });

    expect(await parametros.leerEstadoTecho()).toEqual({ ...estado, gastoUsd: 10.2, bloqueado: true });
    expect(await prisma.parametro.count({ where: { clave: 'llm_estado_techo' } })).toBe(1);
  });

  it('un estado guardado con otra forma se ignora en vez de tumbar la lectura', async () => {
    const { prisma, parametros } = await preparar();
    await prisma.parametro.create({ data: { clave: 'llm_estado_techo', valor: { mes: 7 } } });

    expect(await parametros.leerEstadoTecho()).toBeNull();
  });


  it('el techo de configuración se puede reemplazar desde parametro y los valores inválidos se ignoran', async () => {
    const { prisma, parametros } = await preparar();

    const sinConfigurar = await parametros.obtenerTechoMensualUsd();
    await prisma.parametro.create({ data: { clave: 'llm_techo_mensual_usd', valor: 25.5 } });
    const configurado = await parametros.obtenerTechoMensualUsd();
    await prisma.parametro.update({ where: { clave: 'llm_techo_mensual_usd' }, data: { valor: 'mucho' } });
    const invalido = await parametros.obtenerTechoMensualUsd();

    expect(sinConfigurar).toBeNull();
    expect(configurado).toBe(25.5);
    expect(invalido).toBeNull();
  });

  it('LLM7 — El techo se puede subir desde el parámetro sin reiniciar', async () => {
    const { prisma, crearGateway } = await preparar();
    await gastar(prisma, '12.000000', '2026-09-10T10:00:00.000Z');
    const adaptador = new FakeAdaptadorLlm(new ClockFalso());
    adaptador.programar(MODELO, { resultado: { texto: 'ok', uso: { tokensEntrada: 1, tokensSalida: 1, tokensCache: 0 } } });
    const gateway = crearGateway(adaptador);

    const bloqueado = await gateway.generar(SOLICITUD).catch((causa: unknown) => causa);
    await prisma.parametro.create({ data: { clave: 'llm_techo_mensual_usd', valor: 20 } });
    const respuesta = await gateway.generar(SOLICITUD);

    expect((bloqueado as ErrorPasarelaLlm).codigo).toBe('techo-alcanzado');
    expect(respuesta.texto).toBe('ok');
    expect(adaptador.llamadas).toHaveLength(1);
  });

  it('LLM8 — Cruce del 80 % emite aviso warn una vez por mes, también tras reiniciar', async () => {
    const { prisma, crearGateway, parametros } = await preparar();
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await gastar(prisma, '8.500000', '2026-09-10T10:00:00.000Z');
    await gastar(prisma, '30.000000', '2026-08-10T10:00:00.000Z');
    const primero = new FakeAdaptadorLlm(new ClockFalso());
    primero.programar(MODELO, { resultado: { uso: { tokensEntrada: 1, tokensSalida: 1, tokensCache: 0 } } });
    const segundo = new FakeAdaptadorLlm(new ClockFalso());
    segundo.programar(MODELO, { resultado: { uso: { tokensEntrada: 1, tokensSalida: 1, tokensCache: 0 } } });

    await crearGateway(primero).generar(SOLICITUD);
    await crearGateway(segundo).generar(SOLICITUD);

    const avisos = aviso.mock.calls.filter(
      ([mensaje]) => (mensaje as { evento?: string }).evento === 'llm.techo-aviso',
    );
    expect(avisos).toEqual([
      [{ evento: 'llm.techo-aviso', mes: '2026-09', gastoUsd: 8.5, techoUsd: 10 }],
    ]);
    expect(await parametros.leerEstadoTecho()).toMatchObject({
      mes: '2026-09',
      avisoEmitido: true,
      bloqueado: false,
    });
    aviso.mockRestore();
  });

  it('LLM9 — Gasto al 100 % no llama al LLM y devuelve techo-alcanzado', async () => {
    const { prisma, crearGateway, parametros } = await preparar();
    await gastar(prisma, '6.000000', '2026-09-03T10:00:00.000Z');
    await gastar(prisma, '4.000000', '2026-09-15T10:00:00.000Z');
    const adaptador = new FakeAdaptadorLlm(new ClockFalso());
    adaptador.programar(MODELO, { resultado: { uso: { tokensEntrada: 1, tokensSalida: 1, tokensCache: 0 } } });

    const error = await crearGateway(adaptador)
      .generar(SOLICITUD)
      .catch((causa: unknown) => causa);

    expect(error).toBeInstanceOf(ErrorPasarelaLlm);
    expect((error as ErrorPasarelaLlm).codigo).toBe('techo-alcanzado');
    expect(adaptador.llamadas).toEqual([]);
    const bloqueo = await prisma.usoLlm.findFirst({ where: { proveedor: 'pasarela' } });
    expect(bloqueo).toMatchObject({ modelo: 'techo-alcanzado', exito: false, tokensEntrada: 0 });
    expect(bloqueo?.costoEstimadoUsd.toString()).toBe('0');
    expect(await parametros.leerEstadoTecho()).toMatchObject({
      mes: '2026-09',
      gastoUsd: 10,
      bloqueado: true,
    });
  });
});
