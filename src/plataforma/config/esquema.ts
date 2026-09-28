import { z } from 'zod';

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
    /** Vacío por defecto; obligatorio no vacío en production (`superRefine` abajo). */
    CHATWOOT_BOT_TOKEN: z.string().default(''),
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
