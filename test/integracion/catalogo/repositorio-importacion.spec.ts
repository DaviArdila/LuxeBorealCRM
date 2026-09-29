import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RepositorioImportacionPrisma } from '../../../src/modulos/catalogo/infraestructura/repositorio-importacion-prisma.js';
import type {
  DatosImportacion,
  NuevaExcepcionImportada,
  NuevaTarifaImportada,
  NuevaZonaSinCoberturaImportada,
  NuevoProductoImportado,
  RepositorioImportacionCatalogo,
} from '../../../src/modulos/catalogo/puertos/repositorio-importacion.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio(): Promise<{ repositorio: RepositorioImportacionCatalogo; prisma: PrismaService }> {
  const configuracionDePrueba: Configuracion = {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: false,
    MINIO_ENDPOINT: 'localhost',
    MINIO_PUERTO: 9000,
    MINIO_SSL: false,
    MINIO_ACCESS_KEY: 'luxe',
    MINIO_SECRET_KEY: 'luxeclave',
    MINIO_BUCKET: 'luxeboreal-medios',
    MINIO_URL_PUBLICA: undefined,
    CATALOGO_SHEET_ID: undefined,
    CHATWOOT_URL: 'http://localhost:3001',
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: '',
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 10000,
    COLAS_PREFIJO: 'luxe:colas',
    COLAS_TRABAJADORES: true,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    OUTBOX_BACKOFF_BASE_S: 15,
    OUTBOX_BACKOFF_MAX_S: 300,
    OUTBOX_BARRIDO_MS: 5000,
    OUTBOX_LEASE_S: 60,
    HUMANO_TTL_HORAS: 3,
    HANDOFF_TTL_MIN: 45,
    LOCK_TURNO_TTL_S: 30,
    RATE_LIMIT_POR_HORA: 20,
    RATE_LIMIT_POR_DIA: 60,
    DEBOUNCE_MS: 3000,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const prisma = modulo.get(PrismaService);
  return { repositorio: new RepositorioImportacionPrisma(prisma), prisma };
}

async function crearDepartamentoYCiudad(prisma: PrismaService, prefijo: string) {
  const departamento = await prisma.departamento.create({
    data: { id: `${prefijo}0`, nombre: `Departamento ${prefijo}` },
  });
  const ciudad = await prisma.ciudad.create({
    data: { id: `${prefijo}0001`, departamentoId: departamento.id, nombre: `Ciudad ${prefijo}` },
  });
  return { departamento, ciudad };
}

function producto(overrides: Partial<NuevoProductoImportado> = {}): NuevoProductoImportado {
  const sufijo = crypto.randomUUID().slice(0, 8);
  return {
    sku: overrides.sku ?? `SKU-${sufijo}`,
    nombre: overrides.nombre ?? `Producto ${sufijo}`,
    descripcionCorta: overrides.descripcionCorta ?? 'Descripción corta',
    descripcionLarga: overrides.descripcionLarga ?? 'Descripción larga',
    precioCop: overrides.precioCop ?? 50000,
    activo: overrides.activo ?? true,
    pesoGramos: overrides.pesoGramos ?? null,
    largoMm: overrides.largoMm ?? null,
    anchoMm: overrides.anchoMm ?? null,
    altoMm: overrides.altoMm ?? null,
    claveCollage: overrides.claveCollage ?? null,
    fotosHash: overrides.fotosHash ?? 'hash-inicial',
    fotos: overrides.fotos ?? [],
  };
}

function datosVacios(overrides: Partial<DatosImportacion> = {}): DatosImportacion {
  return {
    productos: overrides.productos ?? [],
    tarifas: overrides.tarifas ?? [],
    zonasSinCobertura: overrides.zonasSinCobertura ?? [],
    parametros: overrides.parametros ?? [],
    excepciones: overrides.excepciones ?? [],
  };
}

const HOY = new Date('2026-09-26T12:00:00.000Z');

describe('Repositorio de importación de catálogo (T7, integración)', () => {
  it('leerEstadoActualPorSku devuelve el estado previo de fotos, fotosHash y claveCollage por SKU (soporte de D8, sin id propio)', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const creado = await prisma.producto.create({
      data: {
        sku: `SKU-EST-${crypto.randomUUID().slice(0, 8)}`,
        nombre: 'Producto con estado previo',
        descripcionCorta: 'x',
        descripcionLarga: 'x',
        precioCop: 1000,
        claveCollage: 'catalogo/sku/collage.jpg',
        fotosHash: 'hash-previo',
        fotos: {
          create: [{ orden: 0, claveArchivo: 'catalogo/sku/foto-0.jpg', origenUrl: 'https://ejemplo.com/1.jpg' }],
        },
      },
    });

    const estado = await repositorio.leerEstadoActualPorSku();
    const estadoDelSku = estado.get(creado.sku);

    expect(estadoDelSku?.claveCollage).toBe('catalogo/sku/collage.jpg');
    expect(estadoDelSku?.fotosHash).toBe('hash-previo');
    expect(estadoDelSku?.fotos).toEqual([
      { orden: 0, claveArchivo: 'catalogo/sku/foto-0.jpg', origenUrl: 'https://ejemplo.com/1.jpg' },
    ]);
  });

  it('IMP11 — Un producto nuevo se crea y uno existente se actualiza por su SKU', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const existente = await prisma.producto.create({
      data: {
        sku: `SKU-EXI-${crypto.randomUUID().slice(0, 8)}`,
        nombre: 'Nombre viejo',
        descripcionCorta: 'x',
        descripcionLarga: 'x',
        precioCop: 1000,
      },
    });
    const nuevoSku = `SKU-NUE-${crypto.randomUUID().slice(0, 8)}`;

    await repositorio.escribirTodoONada(
      datosVacios({
        productos: [
          producto({ sku: existente.sku, nombre: 'Nombre actualizado', precioCop: 99000 }),
          producto({ sku: nuevoSku, nombre: 'Producto nuevo' }),
        ],
      }),
      HOY,
    );

    const actualizado = await prisma.producto.findUnique({ where: { sku: existente.sku } });
    const creado = await prisma.producto.findUnique({ where: { sku: nuevoSku } });

    expect(actualizado?.nombre).toBe('Nombre actualizado');
    expect(actualizado?.precioCop).toBe(99000);
    expect(creado?.nombre).toBe('Producto nuevo');
  });

  it('IMP11 — Las fotos de un producto actualizado se reemplazan por completo', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const sku = `SKU-FOT-${crypto.randomUUID().slice(0, 8)}`;
    const existente = await prisma.producto.create({
      data: {
        sku,
        nombre: 'Producto con fotos',
        descripcionCorta: 'x',
        descripcionLarga: 'x',
        precioCop: 1000,
        fotos: {
          create: [
            { orden: 0, claveArchivo: 'vieja-0.jpg' },
            { orden: 1, claveArchivo: 'vieja-1.jpg' },
            { orden: 2, claveArchivo: 'vieja-2.jpg' },
          ],
        },
      },
    });

    await repositorio.escribirTodoONada(
      datosVacios({
        productos: [
          producto({
            sku,
            fotos: [
              { orden: 0, claveArchivo: 'nueva-0.jpg', esPortada: true, origenUrl: 'https://ejemplo.com/0.jpg' },
              { orden: 1, claveArchivo: 'nueva-1.jpg', esPortada: false, origenUrl: 'https://ejemplo.com/1.jpg' },
            ],
          }),
        ],
      }),
      HOY,
    );

    const fotos = await prisma.foto.findMany({ where: { productoId: existente.id }, orderBy: { orden: 'asc' } });

    expect(fotos).toHaveLength(2);
    expect(fotos.map((f) => f.claveArchivo)).toEqual(['nueva-0.jpg', 'nueva-1.jpg']);
  });

  it('IMP11 — Un producto ausente de la hoja se desactiva, nunca se borra', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const ausente = await prisma.producto.create({
      data: {
        sku: `SKU-AUS-${crypto.randomUUID().slice(0, 8)}`,
        nombre: 'Producto que ya no está en la hoja',
        descripcionCorta: 'x',
        descripcionLarga: 'x',
        precioCop: 1000,
        activo: true,
      },
    });

    await repositorio.escribirTodoONada(datosVacios({ productos: [producto()] }), HOY);

    const fila = await prisma.producto.findUnique({ where: { id: ausente.id } });

    expect(fila).not.toBeNull();
    expect(fila?.activo).toBe(false);
  });

  it('IMP4 — Un producto presente en la hoja con activo=no explícito queda inactivo tras importar (distinto de un SKU ausente, IMP11)', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const sku = `SKU-INA-${crypto.randomUUID().slice(0, 8)}`;
    await prisma.producto.create({
      data: {
        sku,
        nombre: 'Producto que la hoja marca inactivo',
        descripcionCorta: 'x',
        descripcionLarga: 'x',
        precioCop: 1000,
        activo: true,
      },
    });

    await repositorio.escribirTodoONada(datosVacios({ productos: [producto({ sku, activo: false, fotos: [] })] }), HOY);

    const fila = await prisma.producto.findUnique({ where: { sku } });

    expect(fila).not.toBeNull();
    expect(fila?.activo).toBe(false);
  });

  it('IMP11 — tarifa_estimada y zona_sin_cobertura se reemplazan por completo en cada importación', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const { departamento, ciudad } = await crearDepartamentoYCiudad(prisma, 'r1');
    await prisma.tarifaEstimada.create({
      data: { pesoMinG: 0, pesoMaxG: 1000, rangoMinCop: 5000, rangoMaxCop: 8000, diasMin: 1, diasMax: 2 },
    });
    await prisma.zonaSinCobertura.create({ data: { departamentoId: departamento.id, ciudadId: null, motivo: 'vieja' } });

    const nuevaTarifa: NuevaTarifaImportada = {
      departamentoId: departamento.id,
      ciudadId: ciudad.id,
      pesoMinG: 0,
      pesoMaxG: null,
      rangoMinCop: 10000,
      rangoMaxCop: 20000,
      diasMin: 2,
      diasMax: 5,
      contraentregaDisponible: true,
    };
    const nuevaZona: NuevaZonaSinCoberturaImportada = {
      departamentoId: departamento.id,
      ciudadId: ciudad.id,
      motivo: 'nueva',
    };

    await repositorio.escribirTodoONada(datosVacios({ tarifas: [nuevaTarifa], zonasSinCobertura: [nuevaZona] }), HOY);

    const tarifas = await prisma.tarifaEstimada.findMany();
    const zonas = await prisma.zonaSinCobertura.findMany();

    expect(tarifas).toHaveLength(1);
    expect(tarifas[0]?.rangoMinCop).toBe(10000);
    expect(zonas).toHaveLength(1);
    expect(zonas[0]?.motivo).toBe('nueva');
  });

  it('IMP11 — Las excepciones de horario futuras se sincronizan conservando las pasadas', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const fechaPasada = new Date('2020-01-15T00:00:00.000Z');
    await prisma.excepcionHorario.create({ data: { fecha: fechaPasada, motivo: 'histórico' } });

    const excepcionFutura: NuevaExcepcionImportada = { fecha: new Date('2030-12-25T00:00:00.000Z'), motivo: 'navidad' };

    await repositorio.escribirTodoONada(datosVacios({ excepciones: [excepcionFutura] }), HOY);

    const pasada = await prisma.excepcionHorario.findUnique({ where: { fecha: fechaPasada } });
    const futura = await prisma.excepcionHorario.findUnique({ where: { fecha: excepcionFutura.fecha } });

    expect(pasada?.motivo).toBe('histórico');
    expect(futura?.motivo).toBe('navidad');
  });

  it('IMP11 — Un fallo dentro de la transacción revierte todos los cambios de esa importación', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const nuevoSku = `SKU-ROL-${crypto.randomUUID().slice(0, 8)}`;
    const tarifaConDepartamentoInexistente: NuevaTarifaImportada = {
      departamentoId: '99', // código DANE que no existe en esta base de prueba: viola la FK
      ciudadId: null,
      pesoMinG: 0,
      pesoMaxG: null,
      rangoMinCop: 1000,
      rangoMaxCop: 2000,
      diasMin: 1,
      diasMax: 2,
      contraentregaDisponible: true,
    };

    await expect(
      repositorio.escribirTodoONada(
        datosVacios({ productos: [producto({ sku: nuevoSku })], tarifas: [tarifaConDepartamentoInexistente] }),
        HOY,
      ),
    ).rejects.toThrow();

    const productoRevertido = await prisma.producto.findUnique({ where: { sku: nuevoSku } });
    const tarifas = await prisma.tarifaEstimada.findMany();

    expect(productoRevertido).toBeNull();
    expect(tarifas).toHaveLength(0);
  });
});
