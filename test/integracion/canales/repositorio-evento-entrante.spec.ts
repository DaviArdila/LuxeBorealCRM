import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventoCanal } from '../../../src/modulos/canales/dominio/evento-canal.js';
import { RepositorioEventoEntrantePrisma } from '../../../src/modulos/canales/infraestructura/repositorio-evento-entrante-prisma.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio(): Promise<{ repositorio: RepositorioEventoEntrantePrisma; prisma: PrismaService }> {
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
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const prisma = modulo.get(PrismaService);
  return { repositorio: new RepositorioEventoEntrantePrisma(prisma), prisma };
}

function eventoDePrueba(idMensaje: string): EventoCanal {
  return {
    v: 1,
    eventoProveedor: 'message_created',
    conversacion: { idExterno: '42', idContactoExterno: null, canal: 'whatsapp', canalProveedor: 'Channel::Whatsapp' },
    tipo: 'mensaje-entrante',
    idMensaje,
    tipoContenido: 'texto',
  };
}

describe('Repositorio de evento entrante (T3, integración, D5/D7)', () => {
  it('registrar inserta una fila nueva y devuelve su id', async () => {
    const { repositorio } = await crearRepositorio();

    const resultado = await repositorio.registrar({
      origen: 'chatwoot',
      idExterno: 'mensaje:rei-1',
      payload: eventoDePrueba('rei-1'),
    });

    expect(resultado.resultado).toBe('nuevo');
  });

  it('R4 — registrar el mismo (origen, idExterno) dos veces responde "duplicado" sin lanzar', async () => {
    const { repositorio } = await crearRepositorio();
    const entrada = { origen: 'chatwoot', idExterno: 'mensaje:rei-2', payload: eventoDePrueba('rei-2') };

    const primero = await repositorio.registrar(entrada);
    const segundo = await repositorio.registrar(entrada);

    expect(primero.resultado).toBe('nuevo');
    expect(segundo).toEqual({ resultado: 'duplicado' });
  });

  it('D7 — iniciarIntento incrementa intentos y devuelve el payload solo si la fila está pendiente', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const { id } = (await repositorio.registrar({
      origen: 'chatwoot',
      idExterno: 'mensaje:rei-3',
      payload: eventoDePrueba('rei-3'),
    })) as { resultado: 'nuevo'; id: string };

    const evento = await repositorio.iniciarIntento(id);
    const fila = await prisma.eventoEntrante.findUniqueOrThrow({ where: { id } });

    expect(evento).toEqual(eventoDePrueba('rei-3'));
    expect(fila.intentos).toBe(1);
  });

  it('D7 — iniciarIntento devuelve null cuando la fila ya está procesada', async () => {
    const { repositorio } = await crearRepositorio();
    const { id } = (await repositorio.registrar({
      origen: 'chatwoot',
      idExterno: 'mensaje:rei-4',
      payload: eventoDePrueba('rei-4'),
    })) as { resultado: 'nuevo'; id: string };
    await repositorio.marcarProcesado(id, new Date('2026-01-01T00:00:00Z'));

    const evento = await repositorio.iniciarIntento(id);

    expect(evento).toBeNull();
  });

  it('D7 — marcarMuerto deja error visible y listarPendientesAntesDe ya no la incluye', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const { id } = (await repositorio.registrar({
      origen: 'chatwoot',
      idExterno: 'mensaje:rei-5',
      payload: eventoDePrueba('rei-5'),
    })) as { resultado: 'nuevo'; id: string };

    await repositorio.marcarMuerto(id, 'Error: agotado');
    const fila = await prisma.eventoEntrante.findUniqueOrThrow({ where: { id } });
    const pendientes = await repositorio.listarPendientesAntesDe(new Date('2099-01-01T00:00:00Z'), 50);

    expect(fila.error).toBe('Error: agotado');
    expect(pendientes).not.toContain(id);
  });

  it('D7 — listarPendientesAntesDe solo devuelve filas sin procesar ni error, recibidas antes del límite', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const { id } = (await repositorio.registrar({
      origen: 'chatwoot',
      idExterno: 'mensaje:rei-6',
      payload: eventoDePrueba('rei-6'),
    })) as { resultado: 'nuevo'; id: string };
    await prisma.eventoEntrante.update({ where: { id }, data: { recibidoEn: new Date('2020-01-01T00:00:00Z') } });

    const pendientes = await repositorio.listarPendientesAntesDe(new Date('2021-01-01T00:00:00Z'), 50);

    expect(pendientes).toContain(id);
  });
});
