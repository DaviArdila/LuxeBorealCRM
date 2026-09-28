import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RepositorioHorarioPrisma } from '../../../src/modulos/horario/infraestructura/repositorio-horario-prisma.js';
import type { RepositorioHorario } from '../../../src/modulos/horario/puertos/repositorio-horario.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio(): Promise<RepositorioHorario> {
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
  };

  modulo = await Test.createTestingModule({
    imports: [ConfiguracionModule, PrismaModule],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const prisma = modulo.get(PrismaService);
  return new RepositorioHorarioPrisma(prisma);
}

describe('Repositorio de horario (T6, integración)', () => {
  it('existeExcepcion devuelve true solo si hay una fila en excepcion_horario para esa fecha exacta', async () => {
    const repositorio = await crearRepositorio();
    const prisma = modulo!.get(PrismaService);
    await prisma.excepcionHorario.create({
      data: { fecha: new Date('2026-12-25'), motivo: 'Navidad' },
    });

    await expect(repositorio.existeExcepcion('2026-12-25')).resolves.toBe(true);
    await expect(repositorio.existeExcepcion('2026-12-26')).resolves.toBe(false);
  });

  it('obtenerPatronSemanal devuelve null cuando no existe el parámetro horario_atencion', async () => {
    const repositorio = await crearRepositorio();

    await expect(repositorio.obtenerPatronSemanal()).resolves.toBeNull();
  });

  it('obtenerPatronSemanal devuelve el valor crudo tal como está guardado, sin parsear ni validar su forma', async () => {
    const repositorio = await crearRepositorio();
    const prisma = modulo!.get(PrismaService);
    const valorCrudo = { 'lun-vie': '08:00-18:00', sab: '08:00-13:00', dom: null };
    await prisma.parametro.upsert({
      where: { clave: 'horario_atencion' },
      create: { clave: 'horario_atencion', valor: valorCrudo },
      update: { valor: valorCrudo },
    });

    await expect(repositorio.obtenerPatronSemanal()).resolves.toEqual(valorCrudo);
  });
});
