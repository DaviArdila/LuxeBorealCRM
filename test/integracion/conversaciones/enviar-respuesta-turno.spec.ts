import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { EnviarRespuestaTurno } from '../../../src/modulos/conversaciones/aplicacion/enviar-respuesta-turno.js';
import { RepositorioConversacionPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.js';
import type { CapacidadesSalida } from '../../../src/modulos/conversaciones/index.js';
import type { SalidaCanal, SolicitudEnvioMensajes } from '../../../src/modulos/canales/index.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

/** Doble de `SALIDA_CANAL` (T6): registra las llamadas para confirmar si se envió o no. */
class SalidaCanalDoble implements SalidaCanal {
  llamadas: SolicitudEnvioMensajes[] = [];

  enviarMensajes(solicitud: SolicitudEnvioMensajes): Promise<void> {
    this.llamadas.push(solicitud);
    return Promise.resolve();
  }

  cambiarEstado(): Promise<void> {
    return Promise.resolve();
  }

  agregarEtiquetas(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Ningún canal real del perfil (CAN8) declara hoy `admiteImagen: false` (WhatsApp sí; el resto es
 * permisivo), así que el escenario de CNV10 fuerza la capacidad por la costura protegida.
 */
class EnviarRespuestaTurnoSinImagen extends EnviarRespuestaTurno {
  protected override capacidades(): CapacidadesSalida {
    return { mensajeSalienteCuesta: true, admiteImagen: false };
  }
}

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto(): Promise<{
  enviarRespuestaTurno: EnviarRespuestaTurno;
  enviarSinImagen: EnviarRespuestaTurno;
  prisma: PrismaService;
  salidaCanal: SalidaCanalDoble;
}> {
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
  const repositorio = new RepositorioConversacionPrisma(prisma);
  const salidaCanal = new SalidaCanalDoble();
  return {
    enviarRespuestaTurno: new EnviarRespuestaTurno(repositorio, salidaCanal),
    enviarSinImagen: new EnviarRespuestaTurnoSinImagen(repositorio, salidaCanal),
    prisma,
    salidaCanal,
  };
}

async function crearConversacion(prisma: PrismaService, estado: 'bot' | 'humano'): Promise<string> {
  const contacto = await prisma.contacto.create({ data: {} });
  const conversacion = await prisma.conversacion.create({
    data: {
      contactoId: contacto.id,
      chatwootConversationId: Math.floor(Math.random() * 1_000_000_000),
      canal: 'whatsapp',
      estado,
    },
  });
  return conversacion.id;
}

describe('EnviarRespuestaTurno (T6, integración, R5, D10)', () => {
  it('R5 — El estado sigue en bot durante todo el envío', async () => {
    const { enviarRespuestaTurno, prisma, salidaCanal } = await crearContexto();
    const idConv = await crearConversacion(prisma, 'bot');
    const { chatwootConversationId } = await prisma.conversacion.findUniqueOrThrow({ where: { id: idConv } });

    await enviarRespuestaTurno.enviar(idConv, 'resp-1', [
      { paso: 'p1', tipo: 'texto', texto: 'hola' },
      { paso: 'p2', tipo: 'texto', texto: 'mundo' },
    ]);

    expect(salidaCanal.llamadas).toHaveLength(1);
    expect(salidaCanal.llamadas[0]).toEqual({
      idConversacion: String(chatwootConversationId), // el id del canal, no el interno
      idRespuesta: 'resp-1',
      requiereEstado: 'bot', // CNV9: la guardia de canales relee el estado en cada paso
      mensajes: [
        { tipo: 'texto', texto: 'hola' },
        { tipo: 'texto', texto: 'mundo' },
      ],
    });
  });

  it('CNV8 — La respuesta de un handoff admite que la conversación pase a handoff_pendiente antes de publicarse', async () => {
    const { enviarRespuestaTurno, prisma, salidaCanal } = await crearContexto();
    const idConv = await crearConversacion(prisma, 'bot');

    await enviarRespuestaTurno.enviar(idConv, 'resp-h', [{ paso: 'p1', tipo: 'texto', texto: 'te paso con un asesor' }], true);

    expect(salidaCanal.llamadas[0]).toMatchObject({ requiereEstado: 'bot|handoff_pendiente' });
  });

  it('R5 — El estado cambia a humano mientras se envía una secuencia de varios mensajes', async () => {
    const { enviarRespuestaTurno, prisma, salidaCanal } = await crearContexto();
    const idConv = await crearConversacion(prisma, 'humano'); // ya no es bot cuando se intenta enviar

    await enviarRespuestaTurno.enviar(idConv, 'resp-2', [{ paso: 'p1', tipo: 'texto', texto: 'hola' }]);

    expect(salidaCanal.llamadas).toHaveLength(0); // aborta el resto de la secuencia, no envía nada
  });

  it('CNV8 — sin pasos no encola nada aunque la conversación siga en bot', async () => {
    const { enviarRespuestaTurno, prisma, salidaCanal } = await crearContexto();
    const idConv = await crearConversacion(prisma, 'bot');

    await enviarRespuestaTurno.enviar(idConv, 'resp-vacia', []);

    expect(salidaCanal.llamadas).toHaveLength(0);
  });

  it('sin conversación (id inexistente), no envía nada y no lanza', async () => {
    const { enviarRespuestaTurno, salidaCanal } = await crearContexto();

    await expect(
      enviarRespuestaTurno.enviar(crypto.randomUUID(), 'resp-3', [{ paso: 'p1', tipo: 'texto', texto: 'hola' }]),
    ).resolves.toBeUndefined();
    expect(salidaCanal.llamadas).toHaveLength(0);
  });

  it('CNV10 — Un texto seguido de un collage sale como dos mensajes en orden', async () => {
    const { enviarRespuestaTurno, prisma, salidaCanal } = await crearContexto();
    const idConv = await crearConversacion(prisma, 'bot');

    await enviarRespuestaTurno.enviar(idConv, 'resp-img', [
      { paso: 'p1', tipo: 'texto', texto: 'mira este modelo' },
      { paso: 'p2', tipo: 'imagen', claveObjeto: 'catalogo/luna/collage.jpg', leyenda: 'Luna' },
    ]);

    expect(salidaCanal.llamadas).toHaveLength(1);
    expect(salidaCanal.llamadas[0]).toMatchObject({
      requiereEstado: 'bot',
      mensajes: [
        { tipo: 'texto', texto: 'mira este modelo' },
        { tipo: 'imagen', claveObjeto: 'catalogo/luna/collage.jpg', leyenda: 'Luna' },
      ],
    });
  });

  it('CNV10 — Un canal que no admite imagen omite el paso de imagen', async () => {
    const { enviarSinImagen, prisma, salidaCanal } = await crearContexto();
    const idConv = await crearConversacion(prisma, 'bot');

    await enviarSinImagen.enviar(idConv, 'resp-sin-img', [
      { paso: 'p1', tipo: 'texto', texto: 'mira este modelo' },
      { paso: 'p2', tipo: 'imagen', claveObjeto: 'catalogo/luna/collage.jpg' },
    ]);

    expect(salidaCanal.llamadas[0]?.mensajes).toEqual([{ tipo: 'texto', texto: 'mira este modelo' }]);
  });
});
