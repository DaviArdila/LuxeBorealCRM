import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RepositorioEnvioPrisma } from '../../../src/modulos/catalogo/infraestructura/repositorio-envio-prisma.js';
import type { RepositorioEnvio } from '../../../src/modulos/catalogo/puertos/repositorio-envio.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio(): Promise<{ repositorio: RepositorioEnvio; prisma: PrismaService }> {
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
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const prisma = modulo.get(PrismaService);
  return { repositorio: new RepositorioEnvioPrisma(prisma), prisma };
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

describe('Repositorio de envío (T5, integración)', () => {
  it('listarTarifas devuelve departamentoNombre/ciudadNombre resueltos por el include de Prisma (D1)', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const { departamento, ciudad } = await crearDepartamentoYCiudad(prisma, 'e1');

    await prisma.tarifaEstimada.create({
      data: {
        departamentoId: departamento.id,
        ciudadId: ciudad.id,
        pesoMinG: 0,
        pesoMaxG: 1000,
        rangoMinCop: 10000,
        rangoMaxCop: 15000,
        diasMin: 2,
        diasMax: 4,
      },
    });
    // Tarifa nacional: sin departamento ni ciudad.
    await prisma.tarifaEstimada.create({
      data: { pesoMinG: 0, pesoMaxG: null, rangoMinCop: 20000, rangoMaxCop: 30000, diasMin: 3, diasMax: 6 },
    });

    const tarifas = await repositorio.listarTarifas();

    const conCiudad = tarifas.find((t) => t.ciudadNombre === ciudad.nombre);
    expect(conCiudad?.departamentoNombre).toBe(departamento.nombre);

    const nacional = tarifas.find((t) => t.departamentoNombre === null && t.rangoMinCop === 20000);
    expect(nacional?.ciudadNombre).toBeNull();
  });

  it('listarExclusiones devuelve departamentoNombre/ciudadNombre resueltos por el include de Prisma (D1)', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const { departamento, ciudad } = await crearDepartamentoYCiudad(prisma, 'e2');

    await prisma.zonaSinCobertura.create({
      data: { departamentoId: departamento.id, ciudadId: ciudad.id },
    });
    const { departamento: departamentoCompleto } = await crearDepartamentoYCiudad(prisma, 'e3');
    await prisma.zonaSinCobertura.create({ data: { departamentoId: departamentoCompleto.id, ciudadId: null } });

    const exclusiones = await repositorio.listarExclusiones();

    const porCiudad = exclusiones.find((e) => e.ciudadNombre === ciudad.nombre);
    expect(porCiudad?.departamentoNombre).toBe(departamento.nombre);

    const porDepartamento = exclusiones.find((e) => e.departamentoNombre === departamentoCompleto.nombre);
    expect(porDepartamento?.ciudadNombre).toBeNull();
  });

  it('registrarEventoFueraCobertura persiste departamentoId/ciudadId en null (D7) y los textos tal como llegaron', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const producto = await prisma.producto.create({
      data: {
        sku: `SKU-EVT-${crypto.randomUUID().slice(0, 8)}`,
        nombre: 'Producto de prueba',
        descripcionCorta: 'x',
        descripcionLarga: 'x',
        precioCop: 1000,
      },
    });

    await repositorio.registrarEventoFueraCobertura({
      productoId: producto.id,
      departamentoTexto: 'Amazonas raro',
      ciudadTexto: 'Leticia rara',
      departamentoId: null,
      ciudadId: null,
    });

    const filas = await prisma.eventoFueraCobertura.findMany({ where: { productoId: producto.id } });

    expect(filas).toHaveLength(1);
    expect(filas[0]?.departamentoTexto).toBe('Amazonas raro');
    expect(filas[0]?.ciudadTexto).toBe('Leticia rara');
    expect(filas[0]?.departamentoId).toBeNull();
    expect(filas[0]?.ciudadId).toBeNull();
  });
});
