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
import { BarridoEsperas } from '../../src/modulos/conversaciones/infraestructura/colas/barrido-esperas.js';
import { MARCA_ESPERA_CLIENTE, type MarcaEsperaCliente } from '../../src/modulos/conversaciones/puertos/marca-espera-cliente.js';
import { LLM_PORT } from '../../src/modulos/llm/index.js';
import { ALMACENAMIENTO } from '../../src/modulos/medios/index.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { ClockSistema } from '../../src/plataforma/reloj/index.js';
import { AlmacenamientoEnMemoria } from '../fakes/almacenamiento-en-memoria.js';
import { FakePuertoLlm } from '../fakes/puerto-llm-falso.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../soporte/chatwoot.js';
import { ChatwootFalso } from '../soporte/chatwoot-falso.js';
import { TelegramFalso } from '../soporte/telegram-falso.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../soporte/configuracion-llm-de-prueba.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

const SECRETO = 'secreto-e2e-leads';
const RUTA_WEBHOOK = '/api/v1/webhooks/chatwoot';
const DEBOUNCE_MS = 200;

function configuracionDePrueba(
  chatwootFalso: ChatwootFalso,
  telegramFalso: TelegramFalso,
  extra: Partial<Configuracion> = {},
): Configuracion {
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
    ESPERA_CLIENTE_MIN: 10,
    ESPERA_CLIENTE_BARRIDO_MS: 60000,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    TELEGRAM_BOT_TOKEN: 'token-telegram-e2e',
    TELEGRAM_CHAT_ID: '-100555',
    TELEGRAM_API_URL: telegramFalso.url(),
    LEADS_BARRIDO_MS: 1000,
    ...extra,
  };
}


async function crearAplicacion(
  chatwootFalso: ChatwootFalso,
  telegramFalso: TelegramFalso,
  llm: FakePuertoLlm,
  almacenamiento: AlmacenamientoEnMemoria,
  extra: Partial<Configuracion> = {},
): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba(chatwootFalso, telegramFalso, extra))
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
  return { idConversacion: contador, idContacto: contador + 700_000 };
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
  const telegramFalso = new TelegramFalso();
  let app: INestApplication | undefined;
  let llm = new FakePuertoLlm();
  let almacenamiento = new AlmacenamientoEnMemoria();

  beforeAll(async () => {
    await chatwootFalso.iniciar();
    await telegramFalso.iniciar();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    chatwootFalso.limpiar();
    telegramFalso.limpiar();
  });

  afterAll(async () => {
    await chatwootFalso.detener();
    await telegramFalso.detener();
  });

  async function arrancar(extra: Partial<Configuracion> = {}): Promise<INestApplication> {
    llm = new FakePuertoLlm();
    almacenamiento = new AlmacenamientoEnMemoria();
    app = await crearAplicacion(chatwootFalso, telegramFalso, llm, almacenamiento, extra);
    return app;
  }

  /** Espera a que el Telegram falso haya recibido exactamente `cantidad` llamadas y devuelve sus textos. */
  async function esperarAvisos(cantidad: number): Promise<string[]> {
    await vi.waitFor(() => expect(telegramFalso.llamadasRegistradas()).toHaveLength(cantidad), {
      timeout: 15_000,
      interval: 100,
    });
    return telegramFalso.llamadasRegistradas().map((llamada) => llamada.texto ?? '');
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
    // NTF1/NTF3: el aviso sale tras confirmar el handoff, al grupo configurado y sin datos del contacto.
    const [aviso] = await esperarAvisos(1);
    expect(aviso).toContain('caliente');
    expect(aviso).not.toContain(String(idContacto));
    // NTF5: el aviso lleva el enlace que abre la conversación en Chatwoot, en una línea propia.
    const lineaAtender = aviso.split('\n').find((linea) => linea.startsWith('Atender: '));
    expect(lineaAtender).toMatch(new RegExp(`/app/accounts/1/conversations/${String(idConversacion)}$`));
    expect(telegramFalso.llamadasRegistradas()[0]?.chatId).toBe('-100555');
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
    const [aviso] = await esperarAvisos(1);
    expect(aviso).toContain('pide_pagar');
    expect(aviso).toContain('Quiere pagar ya');
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
    expect(telegramFalso.llamadasRegistradas()).toEqual([]);
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
      // LDS4/NTF1: con los datos guardados se avisa una vez, sin el nombre ni la dirección del cliente.
      const [aviso] = await esperarAvisos(1);
      expect(aviso).toContain('fuera de horario');
      expect(aviso).not.toContain('Laura');
      expect(aviso).not.toContain('Calle 45');
    } finally {
      await abrirDeNuevo();
    }
  }, 60_000);

  it('NTF2 — Ventana de 24 horas por contacto: dos conversaciones del mismo contacto avisan una vez', async () => {
    const aplicacion = await arrancar();
    const { idConversacion: primera, idContacto } = nuevaConversacion();
    const { idConversacion: segunda } = nuevaConversacion();
    for (const idConversacion of [primera, segunda]) {
      const idMensaje = nuevoIdMensaje();
      chatwootFalso.programarTextoDeMensaje(String(idConversacion), idMensaje, 'Quiero hablar con un asesor');
      await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje });
      await esperarMensajes(chatwootFalso, idConversacion, 1);
    }

    await esperarAvisos(1);
    // Margen para que un segundo aviso indebido llegara al Telegram falso antes de afirmar que no llegó.
    await new Promise((resolver) => setTimeout(resolver, 1500));
    expect(telegramFalso.llamadasRegistradas()).toHaveLength(1);
  }, 60_000);

  it('NTF4 — Reintento ante fallo de entrega: Telegram responde 500 y luego 200', async () => {
    const aplicacion = await arrancar();
    telegramFalso.programarRespuesta({ status: 500 });

    await turno(aplicacion, 'Quiero hablar con un asesor');

    const avisos = await esperarAvisos(2);
    expect(avisos[1]).toBe(avisos[0]);
    // Ningún aviso más después de la entrega exitosa.
    await new Promise((resolver) => setTimeout(resolver, 1500));
    expect(telegramFalso.llamadasRegistradas()).toHaveLength(2);
  }, 60_000);

  it('NTF4 — Un rechazo permanente no se reintenta y el lead queda intacto', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    telegramFalso.programarRespuesta({ status: 401, cuerpo: { ok: false } });

    const { idContacto } = await turno(aplicacion, 'Quiero hablar con un asesor');

    await esperarAvisos(1);
    await new Promise((resolver) => setTimeout(resolver, 2500));
    expect(telegramFalso.llamadasRegistradas()).toHaveLength(1);
    const contacto = await prisma.contacto.findUniqueOrThrow({ where: { chatwootContactId: idContacto } });
    await expect(prisma.lead.findFirstOrThrow({ where: { contactoId: contacto.id } })).resolves.toMatchObject({
      derivado: true,
      senales: ['pide_persona'],
    });
  }, 60_000);

  it('LDS5 — Un lead derivado sin atender se recuerda una sola vez', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    const { idConversacion, idContacto } = nuevaConversacion();
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: idContacto } });
    const conversacion = await prisma.conversacion.create({
      data: { contactoId: contacto.id, chatwootConversationId: idConversacion, canal: 'whatsapp', estado: 'handoff_pendiente' },
    });
    // Un lead derivado y avisado hace 2 horas (el umbral es de 30 minutos) que nadie tomó.
    const avisadoHace2Horas = new Date(new ClockSistema().ahora().getTime() - 2 * 3_600_000);
    await prisma.lead.create({
      data: {
        contactoId: contacto.id,
        conversacionId: conversacion.id,
        temperatura: 'caliente',
        senales: ['pide_pagar'],
        resumen: 'Quiere pagar ya',
        derivado: true,
        capturadoFueraHorario: false,
        estado: 'nuevo',
        notificadoEn: avisadoHace2Horas,
      },
    });

    const [recordatorio] = await esperarAvisos(1);
    expect(recordatorio).toContain('sin atender');
    expect(recordatorio).toContain('Quiere pagar ya');
    // Varios barridos después (cada segundo) no llega un segundo recordatorio.
    await new Promise((resolver) => setTimeout(resolver, 3500));
    expect(telegramFalso.llamadasRegistradas()).toHaveLength(1);
    const lead = await prisma.lead.findFirstOrThrow({ where: { contactoId: contacto.id } });
    expect(lead.recordatorioEn).not.toBeNull();
  }, 60_000);

  it('NTF6 — El tope de turnos pasa a un asesor y avisa por Telegram con el motivo y el enlace, sin crear un lead', async () => {
    const aplicacion = await arrancar({ AGENTE_TOPE_TURNOS: 1 });
    const prisma = aplicacion.get(PrismaService);
    llm.encolar({ respuesta: { texto: 'Hola, ¿en qué te ayudo?' } });
    const { idConversacion, idContacto } = nuevaConversacion();

    const idPrimero = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), idPrimero, 'Hola');
    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: idPrimero });
    await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(telegramFalso.llamadasRegistradas()).toHaveLength(0); // un turno normal no avisa a nadie

    const idSegundo = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), idSegundo, '¿Tienen regaderas?');
    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: idSegundo });
    await esperarMensajes(chatwootFalso, idConversacion, 2); // el texto de traspaso al cliente

    const [aviso] = await esperarAvisos(1);
    expect(aviso.startsWith('Traspaso:')).toBe(true);
    expect(aviso).toContain('tope de turnos');
    const lineaAtender = aviso.split('\n').find((linea) => linea.startsWith('Atender: '));
    expect(lineaAtender).toMatch(new RegExp(`/app/accounts/1/conversations/${String(idConversacion)}$`));
    expect(aviso).not.toContain(String(idContacto));
    const conversacion = await prisma.conversacion.findUniqueOrThrow({ where: { chatwootConversationId: idConversacion } });
    expect(conversacion.estado).toBe('handoff_pendiente');
    await expect(prisma.lead.count({ where: { contactoId: conversacion.contactoId } })).resolves.toBe(0);
  }, 60_000);

  it('NTF7 — Un cliente que escribe bajo control humano y no recibe respuesta provoca un aviso de espera con el enlace', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    const { idConversacion, idContacto } = nuevaConversacion();
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: idContacto } });
    const conversacion = await prisma.conversacion.create({
      data: { contactoId: contacto.id, chatwootConversationId: idConversacion, canal: 'whatsapp', estado: 'humano' },
    });
    const marca = aplicacion.get<MarcaEsperaCliente>(MARCA_ESPERA_CLIENTE);
    const ahora = new ClockSistema().ahora();

    // El cliente escribe con la conversación en humano: el bot calla y queda registrada la espera (CNV12).
    const idMensaje = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), idMensaje, 'Quiero comprarla');
    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje });
    const lejos = new Date(ahora.getTime() + 3_600_000);
    await vi.waitFor(
      async () => {
        const esperas = await marca.vencidas(lejos, 1000);
        expect(esperas.some((espera) => espera.conversacionId === conversacion.id)).toBe(true);
      },
      { timeout: 15_000, interval: 100 },
    );
    expect(mensajesPosteados(chatwootFalso, idConversacion)).toHaveLength(0);

    // Pasan 11 minutos sin respuesta: se retrocede el instante de la espera (el reloj de la app no se adelanta, el
    // webhook firmado depende de él) y corre el barrido.
    await marca.cerrar(conversacion.id);
    await marca.registrar(conversacion.id, new Date(ahora.getTime() - 11 * 60_000));
    await aplicacion.get(BarridoEsperas).ejecutarBarrido();

    const [aviso] = await esperarAvisos(1);
    expect(aviso.startsWith('Cliente esperando:')).toBe(true);
    expect(aviso).toContain('hace 11 min');
    const lineaAtender = aviso.split('\n').find((linea) => linea.startsWith('Atender: '));
    expect(lineaAtender).toMatch(new RegExp(`/app/accounts/1/conversations/${String(idConversacion)}$`));
    expect(aviso).not.toContain('Quiero comprarla'); // R14: el aviso nunca lleva el contenido del mensaje
  }, 60_000);
});
