/**
 * E2E de la Fase 07b (T9): el agente con LLM y las siete herramientas de punta a punta, con la app
 * real (`AppModule`), BullMQ consumiendo de verdad y Postgres + Redis reales. Cada escenario entra por
 * un webhook firmado de Chatwoot → inbox → turno (debounce + lock) → `ContenidoLlm` → bucle de
 * herramientas con un `FakePuertoLlm` programado sobre `LLM_PORT` (nunca OpenRouter) → herramientas
 * reales sobre Postgres → outbox → `ChatwootFalso` por HTTP. Confirma lo que los dobles de los
 * unitarios no ven: el cableado de `AgenteModule` con `CatalogoModule`, `LlmModule` y `canales`.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import { formatearCop } from '../../src/compartido/dinero/index.js';
import { PublicarEstilo, RestaurarEstilo } from '../../src/modulos/agente/index.js';
import { ErrorPasarelaLlm, LLM_PORT } from '../../src/modulos/llm/index.js';
import { ALMACENAMIENTO } from '../../src/modulos/medios/index.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, type ClienteRedis } from '../../src/plataforma/redis/index.js';
import { AlmacenamientoEnMemoria } from '../fakes/almacenamiento-en-memoria.js';
import { FakePuertoLlm } from '../fakes/puerto-llm-falso.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../soporte/chatwoot.js';
import { ChatwootFalso, type CuerpoMultipart } from '../soporte/chatwoot-falso.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../soporte/configuracion-llm-de-prueba.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';
import { iniciarSesionComo } from '../soporte/sesion-e2e.js';

const SECRETO = 'secreto-e2e-agente-llm';
const RUTA_WEBHOOK = '/api/v1/webhooks/chatwoot';
const DEBOUNCE_MS = 200;
const PRECIO_COP = 389_000;

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
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas-e2e-agente-llm`,
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
    ...CONFIGURACION_AUTH_DE_PRUEBA,
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
let contador = 20_000; // rango propio: cada archivo e2e usa un rango distinto
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

async function esperarMensajes(falso: ChatwootFalso, idConversacion: number, cantidad: number) {
  await vi.waitFor(() => expect(mensajesPosteados(falso, idConversacion)).toHaveLength(cantidad), {
    timeout: 15_000,
    interval: 100,
  });
  return mensajesPosteados(falso, idConversacion).map((l) => l.cuerpo);
}

function contenido(cuerpo: unknown): string {
  return (cuerpo as { content: string }).content;
}

function llamada(id: string, nombre: string, argumentos: Record<string, unknown>) {
  return { respuesta: { llamadasHerramienta: [{ id, nombre, argumentos }] } };
}

/** Todos los resultados de herramienta que vio el modelo hasta su última solicitud, en orden. */
function todosLosResultados(llm: FakePuertoLlm) {
  return (llm.solicitudes.at(-1)?.mensajes ?? []).flatMap((mensaje) => mensaje.resultadosHerramienta ?? []);
}

function resultadosDe(llm: FakePuertoLlm, indiceSolicitud: number) {
  return llm.solicitudes[indiceSolicitud]?.mensajes.at(-1)?.resultadosHerramienta ?? [];
}

describe('Agente con LLM y herramientas de punta a punta (T9 de la Fase 07b)', () => {
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

  async function sembrarProducto(prisma: PrismaService, conFotos = false) {
    const sufijo = crypto.randomUUID().slice(0, 8).toUpperCase();
    const claveFrente = `catalogo/SKU-${sufijo}/foto-1.jpg`;
    const claveLado = `catalogo/SKU-${sufijo}/foto-2.jpg`;
    if (conFotos) {
      await almacenamiento.guardar(claveFrente, Buffer.from(`frente-${sufijo}`), 'image/jpeg');
      await almacenamiento.guardar(claveLado, Buffer.from(`lado-${sufijo}`), 'image/jpeg');
    }
    return prisma.producto.create({
      data: {
        sku: `SKU-${sufijo}`,
        nombre: `Anillo Aurora ${sufijo}`,
        descripcionCorta: 'Oro laminado 18k',
        descripcionLarga: 'Anillo de oro laminado con acabado brillante.',
        precioCop: PRECIO_COP,
        activo: true,
        ...(conFotos
          ? {
              fotos: {
                create: [
                  { orden: 0, esPortada: true, angulo: 'frente', claveArchivo: claveFrente },
                  { orden: 1, esPortada: false, angulo: 'lateral_izquierdo', claveArchivo: claveLado },
                ],
              },
            }
          : {}),
      },
    });
  }

  async function turno(aplicacion: INestApplication, texto: string) {
    const { idConversacion, idContacto } = nuevaConversacion();
    const idMensaje = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), idMensaje, texto);
    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje });
    return { idConversacion, idContacto };
  }

  it('R13 — Respuesta agrupada en el mínimo de mensajes: la ficha sale en un solo mensaje', async () => {
    const aplicacion = await arrancar();
    const producto = await sembrarProducto(aplicacion.get(PrismaService));
    llm.encolar(
      llamada('c1', 'buscar_producto', { query: 'anillo aurora' }),
      llamada('c2', 'obtener_ficha', { id_producto: producto.id }),
      { respuesta: { texto: `El ${producto.nombre} cuesta ${formatearCop(PRECIO_COP)}. Es de oro laminado, ¿te lo muestro?` } },
    );

    const { idConversacion } = await turno(aplicacion, 'Hola, busco un anillo de oro');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain(formatearCop(PRECIO_COP));
    expect(contenido(unico)).toContain(producto.nombre);
    // R1/R2: el precio le llegó al modelo ya formateado por el backend.
    expect(JSON.stringify(resultadosDe(llm, 2))).toContain(formatearCop(PRECIO_COP));
    expect(JSON.stringify(resultadosDe(llm, 1))).not.toContain('389000');
    expect(llm.solicitudes).toHaveLength(3);
    // R1: el modelo recibió exactamente las siete herramientas.
    expect(llm.solicitudes[0]?.herramientas?.map((h) => h.nombre).sort()).toEqual([
      'buscar_producto',
      'consultar_politica',
      'cotizar_envio',
      'enviar_fotos',
      'guardar_datos_contacto',
      'marcar_lead_caliente',
      'obtener_ficha',
    ]);
  }, 40_000);

  it('CAT10 — La cotización con contra entrega llega con la política literal', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    const producto = await sembrarProducto(prisma);
    await prisma.tarifaEstimada.create({
      data: { rangoMinCop: 12_000, rangoMaxCop: 18_000, diasMin: 2, diasMax: 4, contraentregaDisponible: true },
    });
    llm.encolar(
      llamada('c1', 'cotizar_envio', { id_producto: producto.sku, departamento: 'Antioquia', ciudad: 'Medellín' }),
      { respuesta: { texto: 'El envío cuesta entre $12.000 y $18.000, en 2 a 4 días.' } },
    );

    const { idConversacion } = await turno(aplicacion, 'Cuánto cuesta el envío a Medellín?');

    await esperarMensajes(chatwootFalso, idConversacion, 1);
    const [cotizacion] = resultadosDe(llm, 1);
    expect(cotizacion?.esError).toBe(false);
    expect(cotizacion?.resultado).toMatchObject({
      cobertura: true,
      contraentrega_disponible: true,
      rango_texto: expect.stringContaining('12.000') as unknown,
      politica_contraentrega_texto: expect.stringContaining('contra entrega') as unknown,
    });
    // El recargo nunca se cita como porcentaje (R2, CAT12).
    expect(JSON.stringify(cotizacion?.resultado)).not.toMatch(/\d\s?%/);
  }, 40_000);

  it('R2 — Un destino sin cobertura recibe el mensaje del negocio literal aunque el modelo lo parafrasee', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    const producto = await sembrarProducto(prisma);
    await prisma.tarifaEstimada.deleteMany();
    await prisma.parametro.upsert({
      where: { clave: 'mensaje_fuera_cobertura' },
      create: { clave: 'mensaje_fuera_cobertura', valor: 'SIN-COBERTURA-LITERAL: aun no llegamos a ese destino.' },
      update: { valor: 'SIN-COBERTURA-LITERAL: aun no llegamos a ese destino.' },
    });
    llm.encolar(
      llamada('c1', 'cotizar_envio', { id_producto: producto.sku, departamento: 'Vaupés', ciudad: 'Mitú' }),
      { respuesta: { texto: 'Lo siento, por ahora no enviamos a Mitú. ¿Tienes otra dirección?' } },
    );

    const { idConversacion } = await turno(aplicacion, 'Cuánto cuesta el envío a Mitú?');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('SIN-COBERTURA-LITERAL: aun no llegamos a ese destino.');
    expect(contenido(unico)).toContain('¿Tienes otra dirección?');
  }, 40_000);

  it('AGT9 — Sin ángulo llega una sola foto a Chatwoot como imagen después del texto, con su pie de foto', async () => {
    const aplicacion = await arrancar();
    const producto = await sembrarProducto(aplicacion.get(PrismaService), true);
    llm.encolar(
      llamada('c1', 'enviar_fotos', { id_producto: producto.id }),
      { respuesta: { texto: 'Aquí tienes las fotos del anillo' } },
    );

    const { idConversacion } = await turno(aplicacion, 'Me mandas fotos del anillo?');

    const [texto, imagen] = await esperarMensajes(chatwootFalso, idConversacion, 2);
    expect(contenido(texto)).toContain('Aquí tienes las fotos del anillo');
    const multipart = imagen as CuerpoMultipart;
    expect(multipart.multipart).toBe(true);
    expect(multipart.archivos).toHaveLength(1);
    expect(multipart.archivos[0]?.bytes.toString()).toMatch(/^frente-/);
    // AGT17: el pie lo arma el backend con nombre, descripción corta y precio (R2); nunca lleva el SKU.
    // El multipart normaliza el salto de línea del pie a CRLF.
    const pie = (multipart.campos['content'] ?? '').replace(/\r\n/g, '\n');
    expect(pie).toBe(`${producto.nombre} — Oro laminado 18k\n${formatearCop(PRECIO_COP)}`);
    expect(pie).not.toContain(producto.sku);
    // El modelo solo supo cuántas se enviaron, nunca la clave.
    expect(resultadosDe(llm, 1)[0]?.resultado).toEqual({ enviadas: 1 });
  }, 40_000);

  it('AGT9 — Con ángulo llega a Chatwoot solo la foto de ese ángulo, con su pie de foto', async () => {
    const aplicacion = await arrancar();
    const producto = await sembrarProducto(aplicacion.get(PrismaService), true);
    llm.encolar(
      llamada('c1', 'obtener_ficha', { id_producto: producto.id }),
      llamada('c2', 'enviar_fotos', { id_producto: producto.id, angulo: 'lateral_izquierdo' }),
      { respuesta: { texto: 'Te lo muestro de lado' } },
    );

    const { idConversacion } = await turno(aplicacion, 'Me lo muestras de lado?');

    const [texto, imagen] = await esperarMensajes(chatwootFalso, idConversacion, 2);
    expect(contenido(texto)).toContain('Te lo muestro de lado');
    const multipart = imagen as CuerpoMultipart;
    expect(multipart.archivos).toHaveLength(1);
    expect(multipart.archivos[0]?.bytes.toString()).toMatch(/^lado-/);
    expect(multipart.campos['content']).toContain(producto.nombre);
    // La ficha le dijo al modelo qué ángulos puede pedir; nunca claves ni el SKU.
    const [ficha, fotos] = todosLosResultados(llm);
    expect(ficha?.resultado).toMatchObject({ angulos_fotos: ['frente', 'lateral_izquierdo'] });
    expect(JSON.stringify(ficha?.resultado)).not.toContain(producto.sku);
    expect(fotos?.resultado).toEqual({ enviadas: 1 });
  }, 40_000);

  it('AGT9 — Un ángulo que el producto no tiene no manda ninguna imagen y el modelo lo sabe', async () => {
    const aplicacion = await arrancar();
    const producto = await sembrarProducto(aplicacion.get(PrismaService), true);
    llm.encolar(
      llamada('c1', 'enviar_fotos', { id_producto: producto.id, angulo: 'uso' }),
      { respuesta: { texto: 'Esa foto no la tengo, ¿te muestro otra?' } },
    );

    const { idConversacion } = await turno(aplicacion, 'Tienes una foto instalado?');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('no la tengo');
    expect(resultadosDe(llm, 1)[0]?.resultado).toMatchObject({ enviadas: 0, error: expect.stringContaining('frente') as unknown });
  }, 40_000);

  /** Un turno de texto y el prompt de sistema con el que el modelo respondió (AGT13, AGT19). */
  async function promptDeUnTurno(aplicacion: INestApplication, texto: string): Promise<string> {
    llm.encolar({ respuesta: { texto: 'Claro, te ayudo.' } });
    const { idConversacion } = await turno(aplicacion, texto);
    await esperarMensajes(chatwootFalso, idConversacion, 1);
    return llm.solicitudes.at(-1)?.systemPrompt ?? '';
  }

  /** Deja la base y la versión compartida como estaban: el estilo editado no debe filtrarse a otros tests. */
  async function limpiarEstilo(aplicacion: INestApplication): Promise<void> {
    await aplicacion.get(PrismaService).versionEstilo.deleteMany();
    await aplicacion.get<ClienteRedis>(REDIS_CLIENTE).incr('agente:prompt:version');
  }

  it('AGT19 — Publicar un estilo hace que el siguiente mensaje lo use, sin reiniciar', async () => {
    const aplicacion = await arrancar();
    try {
      const antes = await promptDeUnTurno(aplicacion, 'Hola, buenas');
      const publicado = await aplicacion.get(PublicarEstilo, { strict: false }).ejecutar('ESTILO-E2E-PUBLICADO: habla muy formal y sin emojis.');
      const despues = await promptDeUnTurno(aplicacion, 'Hola otra vez');

      expect(publicado).toEqual({ publicado: true, version: 1 });
      expect(antes).toContain('Cómo escribes');
      expect(antes).not.toContain('ESTILO-E2E-PUBLICADO');
      expect(despues).toContain('ESTILO-E2E-PUBLICADO');
      expect(despues).not.toContain('Cómo escribes');
      // AGT18: las reglas no negociables siguen intactas (R1, R2) con cualquier estilo.
      expect(despues).toContain('Nunca calcules dinero');
    } finally {
      await limpiarEstilo(aplicacion);
    }
  }, 60_000);

  it('AGT23 — Publicar por la API cambia el prompt del siguiente turno, sin reiniciar', async () => {
    const aplicacion = await arrancar();
    try {
      const servidor = aplicacion.getHttpServer() as Server;
      const admin = await iniciarSesionComo(servidor, aplicacion.get(PrismaService), 'admin');
      const antes = await promptDeUnTurno(aplicacion, 'Hola, buenas');

      const publicado = await request(servidor)
        .put('/api/v1/agente/estilo')
        .set('x-luxe-csrf', '1')
        .set('cookie', admin.cookie)
        .send({ texto: 'ESTILO-API-E2E: habla muy formal y sin emojis.' });
      const despues = await promptDeUnTurno(aplicacion, 'Hola otra vez');

      expect(publicado.status).toBe(200);
      expect(publicado.body).toEqual({ version: 1 });
      expect(antes).not.toContain('ESTILO-API-E2E');
      expect(despues).toContain('ESTILO-API-E2E');
      // AGT18: las reglas no negociables siguen intactas (R1, R2) con cualquier estilo.
      expect(despues).toContain('Nunca calcules dinero');
    } finally {
      await limpiarEstilo(aplicacion);
    }
  }, 60_000);

  it('AGT21 — Restaurar una versión devuelve ese estilo al siguiente mensaje', async () => {
    const aplicacion = await arrancar();
    try {
      const publicar = aplicacion.get(PublicarEstilo, { strict: false });
      await publicar.ejecutar('ESTILO-UNO: tono cercano.');
      await publicar.ejecutar('ESTILO-DOS: tono muy serio.');
      expect(await promptDeUnTurno(aplicacion, 'Hola')).toContain('ESTILO-DOS');

      const restaurado = await aplicacion.get(RestaurarEstilo, { strict: false }).ejecutar(1);
      const prompt = await promptDeUnTurno(aplicacion, 'Hola de nuevo');

      expect(restaurado).toEqual({ publicado: true, version: 3 });
      expect(prompt).toContain('ESTILO-UNO');
      expect(prompt).not.toContain('ESTILO-DOS');
    } finally {
      await limpiarEstilo(aplicacion);
    }
  }, 60_000);

  it('AGT10 — Los datos que da el cliente quedan guardados en su contacto', async () => {
    const aplicacion = await arrancar();
    llm.encolar(
      llamada('c1', 'guardar_datos_contacto', {
        nombre_completo: 'Laura Gómez Pérez',
        telefono_contacto: 'este mismo',
        direccion: 'Calle 45 # 12-34 apto 301',
        localidad: 'Chapinero',
      }),
      { respuesta: { texto: 'Listo Laura, ya tengo tus datos' } },
    );

    const { idConversacion, idContacto } = await turno(aplicacion, 'Soy Laura Gómez Pérez, vivo en la calle 45 # 12-34 apto 301, Chapinero');

    await esperarMensajes(chatwootFalso, idConversacion, 1);
    const contacto = await aplicacion.get(PrismaService).contacto.findUniqueOrThrow({
      where: { chatwootContactId: idContacto },
    });
    expect(contacto).toMatchObject({
      nombre: 'Laura Gómez Pérez',
      direccion: 'Calle 45 # 12-34 apto 301',
      localidad: 'Chapinero',
      telefonoAlterno: null,
    });
  }, 40_000);

  it('AGT11 — Una propuesta que la escala no confirma se guarda sin derivar', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    llm.encolar(
      llamada('c1', 'marcar_lead_caliente', {
        temperatura: 'caliente',
        senales: ['pregunta_precio'],
        resumen: 'Preguntó el precio, llámalo al 3001234567',
        id_producto: null,
      }),
      { respuesta: { texto: 'Perfecto, sigo contigo' } },
    );

    const { idConversacion, idContacto } = await turno(aplicacion, 'Cuánto cuesta?');

    await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(resultadosDe(llm, 1)[0]?.resultado).toMatchObject({ derivado: false });
    const contacto = await prisma.contacto.findUniqueOrThrow({ where: { chatwootContactId: idContacto } });
    const lead = await prisma.lead.findFirstOrThrow({ where: { contactoId: contacto.id } });
    expect(lead).toMatchObject({ derivado: false, temperatura: 'caliente', estado: 'nuevo' });
    // R14: el resumen que guarda el lead no lleva el teléfono que copió el modelo.
    expect(lead.resumen).not.toContain('3001234567');
    expect(estadosEspejados(chatwootFalso, idConversacion)).toEqual([]);
  }, 40_000);

  it('LDS2 — Una señal fuerte confirma el lead: se guarda derivado y el modelo recibe derivado true', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    llm.encolar(
      llamada('c1', 'marcar_lead_caliente', {
        temperatura: 'caliente',
        senales: ['pide_pagar'],
        resumen: 'Quiere pagar ya',
        id_producto: null,
      }),
      { respuesta: { texto: 'Perfecto' } },
    );

    const { idConversacion, idContacto } = await turno(aplicacion, 'Quiero pagar ya');

    await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(resultadosDe(llm, 1)[0]?.resultado).toMatchObject({ derivado: true });
    const contacto = await prisma.contacto.findUniqueOrThrow({ where: { chatwootContactId: idContacto } });
    await expect(prisma.lead.findFirstOrThrow({ where: { contactoId: contacto.id } })).resolves.toMatchObject({ derivado: true });
  }, 40_000);

  it('AGT6 — Una caída del proveedor deriva a un asesor con el texto de mensaje_error_llm', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    await prisma.parametro.upsert({
      where: { clave: 'mensaje_error_llm' },
      create: { clave: 'mensaje_error_llm', valor: 'ERROR-LLM-TEXTO' },
      update: { valor: 'ERROR-LLM-TEXTO' },
    });
    llm.encolar({ error: new ErrorPasarelaLlm('proveedor-caido') });

    const { idConversacion } = await turno(aplicacion, 'Hola');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('ERROR-LLM-TEXTO');
    await vi.waitFor(() => expect(estadosEspejados(chatwootFalso, idConversacion)).toContain('open'), {
      timeout: 15_000,
      interval: 100,
    });
    const conversacion = await prisma.conversacion.findUniqueOrThrow({ where: { chatwootConversationId: idConversacion } });
    expect(conversacion.estado).toBe('handoff_pendiente');
  }, 40_000);

  it('AGT6 — El techo de gasto deriva con el texto de mensaje_techo_gasto', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    await prisma.parametro.upsert({
      where: { clave: 'mensaje_techo_gasto' },
      create: { clave: 'mensaje_techo_gasto', valor: 'TECHO-TEXTO' },
      update: { valor: 'TECHO-TEXTO' },
    });
    llm.encolar({ error: new ErrorPasarelaLlm('techo-alcanzado') });

    const { idConversacion } = await turno(aplicacion, 'Hola');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('TECHO-TEXTO');
    await vi.waitFor(() => expect(estadosEspejados(chatwootFalso, idConversacion)).toContain('open'), {
      timeout: 15_000,
      interval: 100,
    });
  }, 40_000);

  it('R1 — Un monto sin rastro se reintenta y llega el texto corregido, nunca el original', async () => {
    const aplicacion = await arrancar();
    llm.encolar(
      { respuesta: { texto: 'Cuesta $999.000, ¿te interesa?' } },
      { respuesta: { texto: 'Ese precio te lo confirma un asesor.' } },
    );

    const { idConversacion } = await turno(aplicacion, 'Cuánto cuesta el anillo?');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('Ese precio te lo confirma un asesor.');
    expect(contenido(unico)).not.toContain('999');
    expect(llm.solicitudes).toHaveLength(2);
  }, 40_000);

  it('R1 — Si el monto sin rastro persiste, deriva a un asesor con el texto de cortesía', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    await prisma.parametro.upsert({
      where: { clave: 'mensaje_error_llm' },
      create: { clave: 'mensaje_error_llm', valor: 'ERROR-LLM-TEXTO' },
      update: { valor: 'ERROR-LLM-TEXTO' },
    });
    llm.encolar({ respuesta: { texto: 'Cuesta $999.000' } }, { respuesta: { texto: 'Mejor $888.000' } });

    const { idConversacion } = await turno(aplicacion, 'Cuánto cuesta el anillo?');

    const [unico] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(contenido(unico)).toContain('ERROR-LLM-TEXTO');
    expect(contenido(unico)).not.toMatch(/999|888/);
    await vi.waitFor(() => expect(estadosEspejados(chatwootFalso, idConversacion)).toContain('open'), {
      timeout: 15_000,
      interval: 100,
    });
    const conversacion = await prisma.conversacion.findUniqueOrThrow({ where: { chatwootConversationId: idConversacion } });
    expect(conversacion.estado).toBe('handoff_pendiente');
  }, 40_000);
});
