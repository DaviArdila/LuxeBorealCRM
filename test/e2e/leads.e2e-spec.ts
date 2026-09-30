/**
 * E2E de la Fase 08: leads y handoff de punta a punta, con la app real (`AppModule`), BullMQ consumiendo de
 * verdad y Postgres + Redis reales. Cada escenario entra por un webhook firmado de Chatwoot → inbox → turno →
 * pipeline del agente (con un `FakePuertoLlm` sobre `LLM_PORT`, nunca OpenRouter) → outbox → `ChatwootFalso`.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import { LLM_PORT } from '../../src/modulos/llm/index.js';
import { ALMACENAMIENTO } from '../../src/modulos/medios/index.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { ClockSistema } from '../../src/plataforma/reloj/index.js';
import { AlmacenamientoEnMemoria } from '../fakes/almacenamiento-en-memoria.js';
import { FakePuertoLlm } from '../fakes/puerto-llm-falso.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../soporte/chatwoot.js';
import { ChatwootFalso } from '../soporte/chatwoot-falso.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../soporte/configuracion-llm-de-prueba.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

const SECRETO = 'secreto-e2e-leads';
const RUTA_WEBHOOK = '/api/v1/webhooks/chatwoot';
const DEBOUNCE_MS = 200;

function configuracionDePrueba(chatwootFalso: ChatwootFalso): Configuracion {
  return {
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
    CHATWOOT_URL: chatwootFalso.url(),
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: 'token-de-prueba',
    CHATWOOT_WEBHOOK_SECRETO: SECRETO,
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 5000,
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas-e2e-leads`,
    COLAS_TRABAJADORES: true,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    OUTBOX_BACKOFF_BASE_S: 1,
    OUTBOX_BACKOFF_MAX_S: 1,
    OUTBOX_BARRIDO_MS: 500,
    OUTBOX_LEASE_S: 60,
    HUMANO_TTL_HORAS: 3,
    HANDOFF_TTL_MIN: 45,
    LOCK_TURNO_TTL_S: 30,
    RATE_LIMIT_POR_HORA: 20,
    RATE_LIMIT_POR_DIA: 60,
    DEBOUNCE_MS,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
  };
}


async function crearAplicacion(
  chatwootFalso: ChatwootFalso,
  llm: FakePuertoLlm,
  almacenamiento: AlmacenamientoEnMemoria,
): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba(chatwootFalso))
    .overrideProvider(LLM_PORT)
    .useValue(llm)
    .overrideProvider(ALMACENAMIENTO)
    .useValue(almacenamiento)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>(OPCIONES_APLICACION);
  configurarAplicacion(app);
  await app.listen(0);
  return app;
}

function servidor(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

/** Ids únicos por escenario: la base y Redis se comparten entre los tests de este archivo. */
let contador = 40_000; // rango propio: cada archivo e2e usa un rango distinto
function nuevaConversacion(): { readonly idConversacion: number; readonly idContacto: number } {
  contador += 1;
  return { idConversacion: contador, idContacto: contador };
}
function nuevoIdMensaje(): number {
  contador += 1;
  return contador * 10;
}

interface Entrante {
  readonly idConversacion: number;
  readonly idContacto: number;
  readonly idMensaje: number;
}

async function enviarWebhook(app: INestApplication, entrante: Entrante): Promise<void> {
  const fixture = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');
  const evento = JSON.parse(fixture.rawBody.toString('utf8')) as Record<string, unknown>;
  const conversacion = evento['conversation'] as {
    id: number;
    contact_inbox: { contact_id: number; source_id: string };
  };
  conversacion.id = entrante.idConversacion;
  conversacion.contact_inbox.contact_id = entrante.idContacto;
  conversacion.contact_inbox.source_id = `57300${String(entrante.idContacto)}`;
  evento['id'] = entrante.idMensaje;
  const cuerpo = Buffer.from(JSON.stringify(evento), 'utf8');
  const segundos = Math.floor((performance.timeOrigin + performance.now()) / 1000);
  const respuesta = await request(servidor(app))
    .post(RUTA_WEBHOOK)
    .set('Content-Type', 'application/json')
    .set('X-Chatwoot-Timestamp', String(segundos))
    .set('X-Chatwoot-Signature', firmarComoChatwoot(cuerpo, segundos, SECRETO))
    .send(cuerpo.toString('utf8'));
  expect(respuesta.status).toBeGreaterThanOrEqual(200);
  expect(respuesta.status).toBeLessThan(300);
}


function mensajesPosteados(falso: ChatwootFalso, idConversacion: number): readonly { cuerpo: unknown }[] {
  return falso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/conversations/${String(idConversacion)}/messages`));
}

function estadosEspejados(falso: ChatwootFalso, idConversacion: number): string[] {
  return falso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/conversations/${String(idConversacion)}/toggle_status`))
    .map((l) => (l.cuerpo as { status: string }).status);
}

/** Cierra el negocio todo el día de hoy (hora de Bogotá) con una excepción de horario; devuelve cómo deshacerlo. */
async function cerrarNegocioHoy(prisma: PrismaService): Promise<() => Promise<void>> {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new ClockSistema().ahora());
  const fecha = new Date(`${hoy}T00:00:00.000Z`);
  await prisma.excepcionHorario.upsert({ where: { fecha }, create: { fecha, motivo: 'e2e fuera de horario' }, update: {} });
  return async () => {
    await prisma.excepcionHorario.deleteMany({ where: { fecha } });
  };
}

async function esperarMensajes(falso: ChatwootFalso, idConversacion: number, cantidad: number) {
  await vi.waitFor(() => expect(mensajesPosteados(falso, idConversacion)).toHaveLength(cantidad), {
    timeout: 15_000,
    interval: 100,
  });
  return mensajesPosteados(falso, idConversacion).map((l) => l.cuerpo);
}

function llamada(id: string, nombre: string, argumentos: Record<string, unknown>) {
  return { respuesta: { llamadasHerramienta: [{ id, nombre, argumentos }] } };
}

function etiquetasPuestas(falso: ChatwootFalso, idConversacion: number): string[] {
  return falso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/conversations/${String(idConversacion)}/labels`))
    .flatMap((l) => (l.cuerpo as { labels?: string[] }).labels ?? []);
}

function contenido(cuerpo: unknown): string {
  return (cuerpo as { content: string }).content;
}

describe('Leads y handoff de punta a punta (Fase 08)', () => {
  const chatwootFalso = new ChatwootFalso();
  let app: INestApplication | undefined;
  let llm = new FakePuertoLlm();
  let almacenamiento = new AlmacenamientoEnMemoria();

  beforeAll(async () => {
    await chatwootFalso.iniciar();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    chatwootFalso.limpiar();
  });

  afterAll(async () => {
    await chatwootFalso.detener();
  });

  async function arrancar(): Promise<INestApplication> {
    llm = new FakePuertoLlm();
    almacenamiento = new AlmacenamientoEnMemoria();
    app = await crearAplicacion(chatwootFalso, llm, almacenamiento);
    return app;
  }

  async function turno(aplicacion: INestApplication, texto: string) {
    const { idConversacion, idContacto } = nuevaConversacion();
    const idMensaje = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), idMensaje, texto);
    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje });
    return { idConversacion, idContacto };
  }

  it('LDS3 — Petición explícita de hablar con una persona: deriva sin llamar al LLM', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    await prisma.parametro.upsert({
      where: { clave: 'mensaje_handoff' },
      create: { clave: 'mensaje_handoff', valor: 'TE-PASO-CON-UN-ASESOR' },
      update: { valor: 'TE-PASO-CON-UN-ASESOR' },
    });

    const { idConversacion, idContacto } = await turno(aplicacion, 'Quiero hablar con un asesor');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('TE-PASO-CON-UN-ASESOR');
    expect(llm.solicitudes).toHaveLength(0);
    await vi.waitFor(() => expect(estadosEspejados(chatwootFalso, idConversacion)).toContain('open'), {
      timeout: 15_000,
      interval: 100,
    });
    const conversacion = await prisma.conversacion.findUniqueOrThrow({ where: { chatwootConversationId: idConversacion } });
    expect(conversacion.estado).toBe('handoff_pendiente');
    const contacto = await prisma.contacto.findUniqueOrThrow({ where: { chatwootContactId: idContacto } });
    await expect(prisma.lead.findFirstOrThrow({ where: { contactoId: contacto.id } })).resolves.toMatchObject({
      derivado: true,
      senales: ['pide_persona'],
      temperatura: 'caliente',
    });
  }, 40_000);

  it('LDS3 — Mencionar la palabra no es pedirla: el turno sigue al LLM y no deriva', async () => {
    const aplicacion = await arrancar();
    llm.encolar({ respuesta: { texto: 'Sí, atendemos los sábados de 9 a 1.' } });

    const { idConversacion } = await turno(aplicacion, '¿El asesor de ustedes atiende los sábados?');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('atendemos los sábados');
    expect(llm.solicitudes).toHaveLength(1);
    expect(estadosEspejados(chatwootFalso, idConversacion)).toEqual([]);
  }, 40_000);

  it('AGT11 — La propuesta confirmada por la escala deriva: handoff, etiqueta y lead derivado', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    await prisma.parametro.upsert({
      where: { clave: 'mensaje_handoff' },
      create: { clave: 'mensaje_handoff', valor: 'TE-PASO-CON-UN-ASESOR' },
      update: { valor: 'TE-PASO-CON-UN-ASESOR' },
    });
    llm.encolar(
      llamada('c1', 'marcar_lead_caliente', {
        temperatura: 'caliente',
        senales: ['pide_pagar'],
        resumen: 'Quiere pagar ya',
        id_producto: null,
      }),
      { respuesta: { texto: 'Perfecto, sigo contigo' } },
    );

    const { idConversacion, idContacto } = await turno(aplicacion, 'Quiero pagar ya, ¿cómo lo hago?');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    // El texto que sale es el de handoff del negocio, no lo que escribió el modelo.
    expect(contenido(unico)).toContain('TE-PASO-CON-UN-ASESOR');
    expect(contenido(unico)).not.toContain('sigo contigo');
    await vi.waitFor(() => expect(estadosEspejados(chatwootFalso, idConversacion)).toContain('open'), {
      timeout: 15_000,
      interval: 100,
    });
    await vi.waitFor(() => expect(etiquetasPuestas(chatwootFalso, idConversacion)).toContain('lead-caliente'), {
      timeout: 15_000,
      interval: 100,
    });
    const conversacion = await prisma.conversacion.findUniqueOrThrow({ where: { chatwootConversationId: idConversacion } });
    expect(conversacion.estado).toBe('handoff_pendiente');
    const contacto = await prisma.contacto.findUniqueOrThrow({ where: { chatwootContactId: idContacto } });
    await expect(prisma.lead.findFirstOrThrow({ where: { contactoId: contacto.id } })).resolves.toMatchObject({
      derivado: true,
      senales: ['pide_pagar'],
    });
  }, 40_000);

  it('R9 — Una señal débil sola no deriva aunque el modelo proponga caliente', async () => {
    const aplicacion = await arrancar();
    llm.encolar(
      llamada('c1', 'marcar_lead_caliente', {
        temperatura: 'caliente',
        senales: ['pregunta_precio'],
        resumen: 'Preguntó el precio',
        id_producto: null,
      }),
      { respuesta: { texto: 'Con gusto te cuento más' } },
    );

    const { idConversacion } = await turno(aplicacion, 'Cuánto cuesta?');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('Con gusto te cuento más');
    expect(estadosEspejados(chatwootFalso, idConversacion)).toEqual([]);
    expect(etiquetasPuestas(chatwootFalso, idConversacion)).toEqual([]);
  }, 40_000);

  it('R10 — Fuera de horario el bot captura los datos, avisa el lead y sigue atendiendo', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    const abrirDeNuevo = await cerrarNegocioHoy(prisma);
    try {
      llm.encolar(
        llamada('c1', 'marcar_lead_caliente', {
          temperatura: 'caliente',
          senales: ['pide_pagar'],
          resumen: 'Quiere pagar ya',
          id_producto: null,
        }),
        { respuesta: { texto: 'Con gusto, ¿me das tu nombre completo?' } },
      );
      const { idConversacion, idContacto } = nuevaConversacion();
      const primero = nuevoIdMensaje();
      chatwootFalso.programarTextoDeMensaje(String(idConversacion), primero, 'Quiero pagar ya');
      await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: primero });

      const antes = await esperarMensajes(chatwootFalso, idConversacion, 1);
      // LDS4: no se aparca la conversación: sigue en bot y el modelo pide los datos.
      expect(contenido(antes[0])).toContain('nombre completo');
      const contacto = await prisma.contacto.findUniqueOrThrow({ where: { chatwootContactId: idContacto } });
      await expect(prisma.lead.findFirstOrThrow({ where: { contactoId: contacto.id } })).resolves.toMatchObject({
        derivado: false,
        capturadoFueraHorario: false,
      });
      expect(estadosEspejados(chatwootFalso, idConversacion)).toEqual([]);

      // Segundo turno: el cliente da sus datos y el modelo (con las instrucciones de captura) los guarda.
      llm.encolar(
        llamada('c2', 'guardar_datos_contacto', {
          nombre_completo: 'Laura Gómez Pérez',
          telefono_contacto: 'este mismo',
          direccion: 'Calle 45 # 12-34',
          localidad: 'Chapinero',
        }),
        { respuesta: { texto: 'Listo, ya tengo tus datos' } },
      );
      const segundo = nuevoIdMensaje();
      chatwootFalso.programarTextoDeMensaje(String(idConversacion), segundo, 'Laura Gómez Pérez, calle 45 # 12-34, Chapinero');
      await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: segundo });

      await esperarMensajes(chatwootFalso, idConversacion, 2);
      // Solo el segundo turno (tras crearse el lead pendiente) recibe las instrucciones de captura.
      expect(llm.solicitudes[0]?.systemPrompt).not.toContain('ya mostró intención de compra');
      expect(llm.solicitudes[2]?.systemPrompt).toContain('ya mostró intención de compra');
      const lead = await prisma.lead.findFirstOrThrow({ where: { contactoId: contacto.id } });
      expect(lead).toMatchObject({ derivado: true, capturadoFueraHorario: true });
      const conversacion = await prisma.conversacion.findUniqueOrThrow({ where: { chatwootConversationId: idConversacion } });
      expect(conversacion.estado).toBe('bot');
      expect(estadosEspejados(chatwootFalso, idConversacion)).toEqual([]);
    } finally {
      await abrirDeNuevo();
    }
  }, 60_000);
});
