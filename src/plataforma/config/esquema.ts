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
  })
  .superRefine((datos, ctx) => {
    if (datos.NODE_ENV === 'production' && datos.DOCS_HABILITADO) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOCS_HABILITADO'],
        message: 'DOCS_HABILITADO MUST NOT ser verdadero cuando NODE_ENV es production (API9, D7).',
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
