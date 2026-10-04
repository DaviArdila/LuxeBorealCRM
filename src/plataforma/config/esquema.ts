import { z } from 'zod';
import {
  PROVEEDORES_LLM_REGISTRADOS,
  prefijoNoRegistrado,
  resolverModelo,
} from '../../compartido/llm/index.js';

/** Precios por millón de tokens del modelo principal (ADR-0002); se refrescan al desplegar. */
const PRECIOS_LLM_POR_DEFECTO = JSON.stringify({
  'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 },
});

/** Lista CSV en orden de prioridad (fallback nivel 1, ADR-0014); al menos un modelo. */
function listaDeModelos(porDefecto: string) {
  return z
    .string()
    .default(porDefecto)
    .transform((texto) =>
      texto
        .split(',')
        .map((modelo) => modelo.trim())
        .filter((modelo) => modelo.length > 0),
    )
    .pipe(z.array(z.string()).min(1));
}

const esquemaPrecioModelo = z.object({
  entrada: z.number().min(0),
  salida: z.number().min(0),
  cache: z.number().min(0),
});

/** `LLM_PRECIOS_USD_JSON` llega como JSON de texto y sale como `modelo → precios` ya validado. */
const preciosLlm = z
  .string()
  .default(PRECIOS_LLM_POR_DEFECTO)
  .transform((texto, ctx) => {
    try {
      return JSON.parse(texto) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'debe ser un JSON válido' });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.string(), esquemaPrecioModelo));

/**
 * Esquema Zod de las variables de entorno que necesita la aplicación (PLT1). Única fuente de
 * verdad de la forma de `Configuracion`; `process.env` MUST leerse solo en `plataforma/config`
 * (ver `cargar-configuracion.ts` y `configuracion.module.ts`).
 */
export const esquemaConfiguracion = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\/\S+$/, 'debe ser una URL con esquema postgresql:// o postgres://'),
    REDIS_URL: z
      .string()
      .regex(/^rediss?:\/\/\S+$/, 'debe ser una URL con esquema redis:// o rediss://'),
    HEALTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(1500),
    /** Habilita `/docs` (Scalar, D7 de 00b); MUST NOT quedar en `true` en producción. */
    DOCS_HABILITADO: z
      .enum(['true', 'false'])
      .default('false')
      .transform((valor) => valor === 'true'),
    /** Host de MinIO (T5 de fase-03-importador-medios, design.md §"Configuración", D3). */
    MINIO_ENDPOINT: z.string().default('localhost'),
    MINIO_PUERTO: z.coerce.number().int().min(1).max(65535).default(9000),
    /** `'true'`/`'false'` de texto, igual que `DOCS_HABILITADO`; se convierte a boolean. */
    MINIO_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((valor) => valor === 'true'),
    MINIO_ACCESS_KEY: z.string().default('luxe'),
    MINIO_SECRET_KEY: z.string().default('luxeclave'),
    MINIO_BUCKET: z.string().default('luxeboreal-medios'),
    /** Si falta, `AlmacenamientoMinio` arma la URL pública con endpoint + puerto + SSL (D3). */
    MINIO_URL_PUBLICA: z.string().url().optional(),
    /** Valor por defecto de `--sheet-id`; el CLI de importación también lo acepta como flag. */
    CATALOGO_SHEET_ID: z.string().optional(),
    /** Canal Chatwoot (Fase 04, D2/D3/D12 de `design.md`): API de salida y firma del webhook. */
    CHATWOOT_URL: z.string().url().default('http://localhost:3001'),
    CHATWOOT_ACCOUNT_ID: z.coerce.number().int().min(1).default(1),
    /**
     * Base de los enlaces a la conversación que llevan los avisos al asesor (Fase 08d, D1, NTF5): la URL por la que
     * el asesor abre Chatwoot desde su celular. Ausente ⇒ cae en `CHATWOOT_URL`, que en local es `localhost`.
     */
    CHATWOOT_URL_PUBLICA: z.preprocess((valor) => (valor === '' ? undefined : valor), z.string().url().optional()),
    /** Vacío por defecto; obligatorio no vacío en production (`superRefine` abajo). */
    CHATWOOT_BOT_TOKEN: z.string().default(''),
    /**
     * Token de acceso de un usuario agente de Chatwoot, SOLO para leer mensajes: Chatwoot responde
     * 401 a un token de Agent Bot en `GET .../messages`. Ausente o vacío ⇒ la lectura cae a
     * `CHATWOOT_BOT_TOKEN` con un `warn` de arranque. No es obligatorio en production (pregunta P41).
     * `optional` (no `default('')`) para no obligar a cada configuración literal de los tests a
     * declararla, igual que `MINIO_URL_PUBLICA` y `CATALOGO_SHEET_ID`.
     */
    CHATWOOT_API_TOKEN_LECTURA: z.string().optional(),
    /** Vacío ⇒ la guardia de firma rechaza todo (D3, falla cerrada); obligatorio en production. */
    CHATWOOT_WEBHOOK_SECRETO: z.string().default(''),
    CHATWOOT_WEBHOOK_TOLERANCIA_S: z.coerce.number().int().min(30).max(3600).default(300),
    CHATWOOT_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
    /** `plataforma/colas` (Fase 04, T4, D6 de `design.md`): raíz de BullMQ sobre `REDIS_URL`. */
    COLAS_PREFIJO: z.string().default('luxe:colas'),
    /**
     * Si este proceso arranca los *workers* de BullMQ (D6). `false` en los contextos que generan
     * el contrato OpenAPI (sin Redis real): registran colas pero nunca arrancan un *worker* ni un
     * barrido, para que `contrato:deriva` siga siendo determinista.
     */
    COLAS_TRABAJADORES: z
      .enum(['true', 'false'])
      .default('true')
      .transform((valor) => valor === 'true'),
    /** Procesador del inbox (D7, CAN4): intentos de BullMQ antes de marcar `error` en la fila. */
    INBOX_MAX_INTENTOS: z.coerce.number().int().min(1).max(20).default(5),
    /** Barrido del inbox (D7): cada cuánto se reencolan filas pendientes sin `error`. */
    INBOX_BARRIDO_MS: z.coerce.number().int().min(1000).default(30000),
    /** `plataforma/outbox` (Fase 04, T6, D10/D12): intentos antes de agotar y marcar `error`. */
    OUTBOX_MAX_INTENTOS: z.coerce.number().int().min(1).max(20).default(5),
    /** Backoff exponencial del publicador (Q1, D12): `min(base·2^(intentos−1), max)`. */
    OUTBOX_BACKOFF_BASE_S: z.coerce.number().int().min(1).default(15),
    OUTBOX_BACKOFF_MAX_S: z.coerce.number().int().min(1).default(300),
    /** Barrido del outbox (D10): cada cuánto `publicarPendientes()` reintenta disparos perdidos. */
    OUTBOX_BARRIDO_MS: z.coerce.number().int().min(500).default(5000),
    /** Duración del *lease* de una fila reclamada (D10): tras vencer, vuelve a estar disponible. */
    OUTBOX_LEASE_S: z.coerce.number().int().min(10).default(60),
    /** `modulos/conversaciones` (Fase 05, T1, D3/Q2): vencimiento de `humano` sin eco del asesor. */
    HUMANO_TTL_HORAS: z.coerce.number().min(0.5).default(3),
    /** Vencimiento de `handoff_pendiente` sin que nadie lo recoja (D3/Q2). */
    HANDOFF_TTL_MIN: z.coerce.number().int().min(1).default(45),
    /** `LockTurno` (Fase 05, T3, D7): TTL del lock `SET NX EX` por conversación. */
    LOCK_TURNO_TTL_S: z.coerce.number().int().min(5).default(30),
    /** `ContadorRateLimit` (T3, R13): tope de mensajes por contacto en la hora en curso. */
    RATE_LIMIT_POR_HORA: z.coerce.number().int().min(1).default(20),
    /** Tope de mensajes por contacto en el día en curso (R13). */
    RATE_LIMIT_POR_DIA: z.coerce.number().int().min(1).default(60),
    /** `ColaTurno` (Fase 05, T4, D6): ventana de debounce que agrupa una ráfaga de mensajes. */
    DEBOUNCE_MS: z.coerce.number().int().min(500).default(3000),
    /** `ProcesadorTurno` (T4, D7): conversaciones distintas procesadas en paralelo. */
    CONVERSACIONES_CONCURRENCIA: z.coerce.number().int().min(1).default(10),
    /** `BarridoVencimientos` (T7, D11): cada cuánto se devuelven a `bot` las filas vencidas. */
    CONVERSACIONES_BARRIDO_MS: z.coerce.number().int().min(10000).default(300000),
    /** `MarcaEsperaHandoff` (T8, D12): minutos en `handoff_pendiente` antes del aviso único de espera. */
    HANDOFF_ESPERA_MIN: z.coerce.number().int().min(1).default(30),
    /** Minutos que un cliente espera bajo control humano antes de avisar al asesor (Fase 08d, D5, NTF7, P47). */
    ESPERA_CLIENTE_MIN: z.coerce.number().int().min(1).default(10),
    /** `BarridoEsperas` (Fase 08d, D5): cada cuánto se revisan los clientes que esperan respuesta. */
    ESPERA_CLIENTE_BARRIDO_MS: z.coerce.number().int().min(10000).default(60000),
    /** `modulos/llm` (Fase 06, T3, D12, R15): perfil `conversacion`; cambiar de modelo es cambiar datos. */
    LLM_CONVERSACION_MODELOS: listaDeModelos('openai/gpt-5.6-luna'),
    /** Por debajo de `LOCK_TURNO_TTL_S · 1000` (LLM3, `superRefine` abajo). */
    LLM_CONVERSACION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
    LLM_CONVERSACION_MAX_TOKENS: z.coerce.number().int().min(1).max(8000).default(400),
    LLM_CONVERSACION_MAX_REINTENTOS: z.coerce.number().int().min(0).max(2).default(2),
    /** Perfil `evals`: sin la presión del lock de turno, admite más tiempo. */
    LLM_EVALS_MODELOS: listaDeModelos('openai/gpt-5.6-luna'),
    LLM_EVALS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    LLM_EVALS_MAX_TOKENS: z.coerce.number().int().min(1).max(8000).default(400),
    LLM_EVALS_MAX_REINTENTOS: z.coerce.number().int().min(0).max(2).default(2),
    /** Techo mensual de gasto del LLM en USD dentro de los 20 USD de R13 (Q1, P17). */
    LLM_TECHO_MENSUAL_USD: z.coerce.number().positive().default(10),
    /** Porcentaje del techo al que se emite el aviso `warn` (Q2, LLM8). */
    LLM_UMBRAL_AVISO_PCT: z.coerce.number().int().min(1).max(99).default(80),
    /** Texto JSON en el entorno; ya parseado en `Configuracion`. Debe cubrir todos los modelos. */
    LLM_PRECIOS_USD_JSON: preciosLlm,
    /** Backoff del gateway (D4): `min(base · 2^n + jitter, max)`. */
    LLM_REINTENTO_BASE_MS: z.coerce.number().int().min(1).default(500),
    LLM_REINTENTO_MAX_MS: z.coerce.number().int().min(1).default(2000),
    /** Circuit breaker por modelo (D5, ADR-0013): fallos consecutivos y ventana abierta. */
    LLM_CB_UMBRAL_FALLOS: z.coerce.number().int().min(2).default(5),
    LLM_CB_VENTANA_S: z.coerce.number().int().min(10).default(60),
    /** `modulos/agente` (Fase 07a, T4, D10): turnos que el bot responde por sesión antes de derivar (R13). */
    AGENTE_TOPE_TURNOS: z.coerce.number().int().min(1).default(12),
    /** Vida de los contadores de sesión del agente en Redis, en horas (D8); 168 h = 7 días. */
    AGENTE_SESION_TTL_H: z.coerce.number().int().min(1).max(720).default(168),
    /** Vueltas máximas del bucle de herramientas por turno (Fase 07b, D10, AGT5). */
    AGENTE_MAX_VUELTAS: z.coerce.number().int().min(1).max(8).default(5),
    /** Turnos previos de la sesión que se envían al LLM (Fase 07b, D10, AGT7); 0 = sin historial. */
    AGENTE_HISTORIAL_TURNOS: z.coerce.number().int().min(0).max(20).default(6),
    /** El importador genera el collage de cada producto solo si es `'true'` (Fase 08b, IMP15). */
    CATALOGO_GENERAR_COLLAGE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((valor) => valor === 'true'),
    /** Fotos individuales máximas por sesión (Fase 07b, D10, AGT9). */
    AGENTE_FOTOS_INDIVIDUALES_MAX: z.coerce.number().int().min(1).max(10).default(4),
    /** Vacía por defecto; obligatoria no vacía en production (`superRefine` abajo). */
    OPENROUTER_API_KEY: z.string().default(''),
    /** Override hacia el simulador local en las pruebas (D11). */
    OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
    /** Proveedor `openai` directo (LLM17); obligatoria en production solo si un perfil usa `openai:`. */
    OPENAI_API_KEY: z.string().default(''),
    /** Avisos a los asesores (Fase 08, D9/D11): vacíos por defecto; obligatorios en production. */
    TELEGRAM_BOT_TOKEN: z.string().default(''),
    TELEGRAM_CHAT_ID: z.string().default(''),
    /** Override hacia el Telegram falso en las pruebas. */
    TELEGRAM_API_URL: z.string().url().default('https://api.telegram.org'),
    TELEGRAM_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
    /** Un solo aviso por contacto en esta ventana, en horas (Fase 08, D8, R11). */
    LEADS_VENTANA_NOTIFICACION_H: z.coerce.number().int().min(1).max(168).default(24),
    /** Minutos que un lead derivado espera sin atenderse antes de recordarlo al asesor (Fase 08, D10, P35). */
    LEADS_RECORDATORIO_MIN: z.coerce.number().int().min(1).max(1440).default(30),
    /** Barrido de recordatorios (D10): cada cuánto se revisan los leads sin atender. */
    LEADS_BARRIDO_MS: z.coerce.number().int().min(1000).default(60000),
    /** `modulos/usuarios` (Fase 11a, USR3, P51): minutos sin actividad tras los que vence una sesión. */
    SESION_INACTIVIDAD_MIN: z.coerce.number().int().min(5).max(10080).default(720),
    /** Horas desde la creación tras las que vence una sesión aunque tenga actividad (USR3, P51). */
    SESION_DURACION_MAX_H: z.coerce.number().int().min(1).max(720).default(168),
    /** Inicios de sesión fallidos por correo e IP antes de bloquear la pareja (USR8, P53). */
    AUTH_INTENTOS_MAX: z.coerce.number().int().min(1).max(50).default(5),
    /** Ventana del contador de fallos, en minutos; el bloqueo vence con ella (USR8, P53). */
    AUTH_VENTANA_MIN: z.coerce.number().int().min(1).max(1440).default(15),
  })
  .superRefine((datos, ctx) => {
    if (datos.NODE_ENV === 'production' && datos.DOCS_HABILITADO) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOCS_HABILITADO'],
        message: 'DOCS_HABILITADO MUST NOT ser verdadero cuando NODE_ENV es production (API9, D7).',
      });
    }
    if (datos.NODE_ENV === 'production' && datos.CHATWOOT_BOT_TOKEN === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['CHATWOOT_BOT_TOKEN'],
        message: 'CHATWOOT_BOT_TOKEN MUST NOT estar vacío cuando NODE_ENV es production (D12).',
      });
    }
    if (datos.NODE_ENV === 'production' && datos.CHATWOOT_WEBHOOK_SECRETO === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['CHATWOOT_WEBHOOK_SECRETO'],
        message: 'CHATWOOT_WEBHOOK_SECRETO MUST NOT estar vacío cuando NODE_ENV es production (D3).',
      });
    }
    if (datos.NODE_ENV === 'production' && datos.TELEGRAM_BOT_TOKEN === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message: 'TELEGRAM_BOT_TOKEN MUST NOT estar vacío cuando NODE_ENV es production (D9).',
      });
    }
    if (datos.NODE_ENV === 'production' && datos.TELEGRAM_CHAT_ID === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_CHAT_ID'],
        message: 'TELEGRAM_CHAT_ID MUST NOT estar vacío cuando NODE_ENV es production (D9).',
      });
    }
    if (datos.LLM_CONVERSACION_TIMEOUT_MS >= datos.LOCK_TURNO_TTL_S * 1000) {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_CONVERSACION_TIMEOUT_MS'],
        message: 'LLM_CONVERSACION_TIMEOUT_MS MUST ser menor que LOCK_TURNO_TTL_S · 1000 (LLM3).',
      });
    }
    if (datos.SESION_DURACION_MAX_H * 60 < datos.SESION_INACTIVIDAD_MIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESION_DURACION_MAX_H'],
        message: 'SESION_DURACION_MAX_H MUST cubrir al menos SESION_INACTIVIDAD_MIN (USR3).',
      });
    }
    if (datos.LLM_REINTENTO_BASE_MS > datos.LLM_REINTENTO_MAX_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_REINTENTO_BASE_MS'],
        message: 'LLM_REINTENTO_BASE_MS MUST ser menor o igual que LLM_REINTENTO_MAX_MS (D4).',
      });
    }
    const perfiles = [
      ['LLM_CONVERSACION_MODELOS', datos.LLM_CONVERSACION_MODELOS],
      ['LLM_EVALS_MODELOS', datos.LLM_EVALS_MODELOS],
    ] as const;
    const proveedoresUsados = new Set<string>();
    for (const [variable, modelos] of perfiles) {
      if (modelos.some((modelo) => prefijoNoRegistrado(modelo, PROVEEDORES_LLM_REGISTRADOS) !== null)) {
        ctx.addIssue({
          code: 'custom',
          path: [variable],
          message: `${variable} MUST usar solo prefijos de proveedores registrados (LLM16).`,
        });
      }
      for (const modelo of modelos) {
        proveedoresUsados.add(resolverModelo(modelo, PROVEEDORES_LLM_REGISTRADOS).proveedor);
      }
      if (modelos.some((modelo) => !(modelo in datos.LLM_PRECIOS_USD_JSON))) {
        ctx.addIssue({
          code: 'custom',
          path: [variable],
          message: `${variable} MUST listar solo modelos con precio en LLM_PRECIOS_USD_JSON (D6).`,
        });
      }
    }
    // LLM17: en production solo se exige la clave de los proveedores que algún perfil usa.
    if (datos.NODE_ENV === 'production') {
      const claves: Readonly<Record<string, [string, string]>> = {
        openrouter: ['OPENROUTER_API_KEY', datos.OPENROUTER_API_KEY],
        openai: ['OPENAI_API_KEY', datos.OPENAI_API_KEY],
      };
      for (const proveedor of proveedoresUsados) {
        const [variable, valor] = claves[proveedor] ?? [];
        if (variable !== undefined && valor === '') {
          ctx.addIssue({
            code: 'custom',
            path: [variable],
            message: `${variable} MUST NOT estar vacía cuando NODE_ENV es production y un perfil usa ${proveedor} (LLM17).`,
          });
        }
      }
    }
  });

export type Configuracion = Readonly<z.infer<typeof esquemaConfiguracion>>;

/** Tipo de problema detectado en una variable de configuración; nunca describe su valor. */
export type ProblemaConfiguracion = 'falta' | 'formato' | 'valor';

export interface VariableInvalida {
  readonly nombre: string;
  readonly problema: ProblemaConfiguracion;
}

/**
 * Configuración inválida o incompleta (PLT1). Nombra cada variable afectada y el tipo de
 * problema (`falta`, `formato` o `valor`); el mensaje y `variables` MUST NOT incluir el valor
 * recibido, para no filtrar secretos (`DATABASE_URL`, `REDIS_URL`) en logs de arranque.
 */
export class ConfiguracionInvalidaError extends Error {
  readonly variables: readonly VariableInvalida[];

  constructor(variables: readonly VariableInvalida[]) {
    const resumen = variables.map((variable) => `${variable.nombre} (${variable.problema})`).join(', ');
    super(`Configuración inválida o incompleta: ${resumen}`);
    this.name = 'ConfiguracionInvalidaError';
    this.variables = variables;
  }
}
