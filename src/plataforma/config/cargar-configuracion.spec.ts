import { describe, expect, it } from 'vitest';
import { cargarConfiguracion } from './cargar-configuracion.js';
import { ConfiguracionInvalidaError, type VariableInvalida } from './esquema.js';

const fuenteValida = {
  NODE_ENV: 'development',
  PORT: '3000',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://luxe:luxe@localhost:5435/luxeboreal',
  REDIS_URL: 'redis://localhost:6380',
  HEALTH_TIMEOUT_MS: '1500',
};

function omitir<T extends Record<string, unknown>, K extends keyof T>(
  fuente: T,
  clave: K,
): Omit<T, K> {
  const copia = { ...fuente };
  delete copia[clave];
  return copia;
}

describe('cargarConfiguracion', () => {
  it('con una fuente válida devuelve una Configuracion congelada con los tipos correctos', () => {
    const configuracion = cargarConfiguracion(fuenteValida);

    expect(configuracion).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: fuenteValida.DATABASE_URL,
      REDIS_URL: fuenteValida.REDIS_URL,
      HEALTH_TIMEOUT_MS: 1500,
    });
    expect(Object.isFrozen(configuracion)).toBe(true);
  });

  it('usa los valores por defecto cuando las variables opcionales faltan', () => {
    const soloRequeridas = {
      DATABASE_URL: fuenteValida.DATABASE_URL,
      REDIS_URL: fuenteValida.REDIS_URL,
    };

    const configuracion = cargarConfiguracion(soloRequeridas);

    expect(configuracion.NODE_ENV).toBe('development');
    expect(configuracion.PORT).toBe(3000);
    expect(configuracion.LOG_LEVEL).toBe('info');
    expect(configuracion.HEALTH_TIMEOUT_MS).toBe(1500);
  });

  it('lanza ConfiguracionInvalidaError nombrando la variable cuando falta una requerida', () => {
    const sinDatabaseUrl = omitir(fuenteValida, 'DATABASE_URL');

    expect.assertions(2);
    try {
      cargarConfiguracion(sinDatabaseUrl);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfiguracionInvalidaError);
      expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
        nombre: 'DATABASE_URL',
        problema: 'falta',
      });
    }
  });

  it('lanza ConfiguracionInvalidaError nombrando la variable cuando el formato es inválido', () => {
    const fuenteInvalida = { ...fuenteValida, DATABASE_URL: 'no-es-una-url-postgres' };

    expect.assertions(1);
    try {
      cargarConfiguracion(fuenteInvalida);
    } catch (error) {
      expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
        nombre: 'DATABASE_URL',
        problema: 'formato',
      });
    }
  });

  it('lanza ConfiguracionInvalidaError nombrando la variable cuando el valor no está permitido', () => {
    const fuenteInvalida = { ...fuenteValida, NODE_ENV: 'staging' };

    expect.assertions(1);
    try {
      cargarConfiguracion(fuenteInvalida);
    } catch (error) {
      expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
        nombre: 'NODE_ENV',
        problema: 'valor',
      });
    }
  });

  it('el error nunca contiene el valor de la variable que falló, ni en variables ni en el mensaje', () => {
    const valorSecreto = 'postgresql://usuario-secreto:clave-secreta@host-interno/base';
    const fuenteInvalida = { ...fuenteValida, DATABASE_URL: `${valorSecreto} con espacios` };

    expect.assertions(2);
    try {
      cargarConfiguracion(fuenteInvalida);
    } catch (error) {
      const err = error as ConfiguracionInvalidaError;
      expect(err.message).not.toContain(valorSecreto);
      expect(JSON.stringify(err.variables)).not.toContain(valorSecreto);
    }
  });

  it('clasifica como "formato" un valor coercible que no es un número, no como "falta"', () => {
    const fuenteInvalida = { ...fuenteValida, PORT: 'no-es-un-numero' };

    expect.assertions(1);
    try {
      cargarConfiguracion(fuenteInvalida);
    } catch (error) {
      expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
        nombre: 'PORT',
        problema: 'formato',
      });
    }
  });

  it('reporta todas las variables inválidas a la vez, no solo la primera', () => {
    const fuenteInvalida = { ...fuenteValida, NODE_ENV: 'staging', PORT: 'no-es-un-numero' };

    expect.assertions(1);
    try {
      cargarConfiguracion(fuenteInvalida);
    } catch (error) {
      const nombres = (error as ConfiguracionInvalidaError).variables.map((v) => v.nombre);
      expect(nombres).toEqual(expect.arrayContaining(['NODE_ENV', 'PORT']));
    }
  });

  describe('DOCS_HABILITADO (D7, API9)', () => {
    it('por defecto queda en false cuando la variable no viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.DOCS_HABILITADO).toBe(false);
    });

    it('acepta "true" y lo convierte a boolean', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, DOCS_HABILITADO: 'true' });

      expect(configuracion.DOCS_HABILITADO).toBe(true);
    });

    it('acepta "false" explícito y lo convierte a boolean', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, DOCS_HABILITADO: 'false' });

      expect(configuracion.DOCS_HABILITADO).toBe(false);
    });

    it('rechaza un valor que no sea "true" ni "false"', () => {
      const fuenteInvalida = { ...fuenteValida, DOCS_HABILITADO: 'yes' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'DOCS_HABILITADO',
          problema: 'valor',
        });
      }
    });

    it('API9 — El proceso rechaza arrancar con /docs habilitado en producción', () => {
      const fuenteInvalida = { ...fuenteValida, NODE_ENV: 'production', DOCS_HABILITADO: 'true' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'DOCS_HABILITADO',
          problema: 'valor',
        });
      }
    });

    it('acepta NODE_ENV=production con DOCS_HABILITADO=false (o ausente)', () => {
      // CHATWOOT_BOT_TOKEN/CHATWOOT_WEBHOOK_SECRETO no vacíos (D3/D12, fase-04-canal-chatwoot):
      // sin ellos, production ya se rechaza por esa validación, independiente de DOCS_HABILITADO
      // — no es el foco de este caso, así que se fijan aquí para no acoplar ambas reglas.
      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        NODE_ENV: 'production',
        CHATWOOT_BOT_TOKEN: 'token-real',
        CHATWOOT_WEBHOOK_SECRETO: 'secreto-real',
        TELEGRAM_BOT_TOKEN: 'token-telegram',
        TELEGRAM_CHAT_ID: '-100123',
        OPENROUTER_API_KEY: 'clave-real',
      });

      expect(configuracion.DOCS_HABILITADO).toBe(false);
    });
  });

  describe('Variables MINIO_*/CATALOGO_SHEET_ID (T5 de fase-03-importador-medios, D3)', () => {
    it('usa los valores de desarrollo por defecto cuando ninguna variable MINIO_* viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.MINIO_ENDPOINT).toBe('localhost');
      expect(configuracion.MINIO_PUERTO).toBe(9000);
      expect(configuracion.MINIO_SSL).toBe(false);
      expect(configuracion.MINIO_ACCESS_KEY).toBe('luxe');
      expect(configuracion.MINIO_SECRET_KEY).toBe('luxeclave');
      expect(configuracion.MINIO_BUCKET).toBe('luxeboreal-medios');
      expect(configuracion.MINIO_URL_PUBLICA).toBeUndefined();
      expect(configuracion.CATALOGO_SHEET_ID).toBeUndefined();
    });

    it('acepta MINIO_SSL="true" y lo convierte a boolean', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, MINIO_SSL: 'true' });

      expect(configuracion.MINIO_SSL).toBe(true);
    });

    it('rechaza MINIO_SSL con un valor que no sea "true" ni "false"', () => {
      const fuenteInvalida = { ...fuenteValida, MINIO_SSL: 'yes' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'MINIO_SSL',
          problema: 'valor',
        });
      }
    });

    it('rechaza MINIO_URL_PUBLICA que no es una URL', () => {
      const fuenteInvalida = { ...fuenteValida, MINIO_URL_PUBLICA: 'no-es-una-url' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'MINIO_URL_PUBLICA',
          problema: 'formato',
        });
      }
    });

    it('acepta MINIO_URL_PUBLICA cuando es una URL válida', () => {
      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        MINIO_URL_PUBLICA: 'https://medios.luxeboreal.com',
      });

      expect(configuracion.MINIO_URL_PUBLICA).toBe('https://medios.luxeboreal.com');
    });

    it('acepta CATALOGO_SHEET_ID cuando viene, sin transformarlo', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, CATALOGO_SHEET_ID: 'abc123' });

      expect(configuracion.CATALOGO_SHEET_ID).toBe('abc123');
    });
  });

  describe('Variables CHATWOOT_* (fase-04-canal-chatwoot, T3, D2/D3/D12)', () => {
    it('usa los valores de desarrollo por defecto cuando ninguna variable CHATWOOT_* viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.CHATWOOT_URL).toBe('http://localhost:3001');
      expect(configuracion.CHATWOOT_ACCOUNT_ID).toBe(1);
      expect(configuracion.CHATWOOT_BOT_TOKEN).toBe('');
      expect(configuracion.CHATWOOT_WEBHOOK_SECRETO).toBe('');
      expect(configuracion.CHATWOOT_WEBHOOK_TOLERANCIA_S).toBe(300);
      expect(configuracion.CHATWOOT_HTTP_TIMEOUT_MS).toBe(10000);
    });

    it('CHATWOOT_API_TOKEN_LECTURA es opcional (ausente por defecto) y se acepta tal cual', () => {
      expect(cargarConfiguracion(fuenteValida).CHATWOOT_API_TOKEN_LECTURA).toBeUndefined();
      expect(
        cargarConfiguracion({ ...fuenteValida, CHATWOOT_API_TOKEN_LECTURA: 'token-de-usuario' })
          .CHATWOOT_API_TOKEN_LECTURA,
      ).toBe('token-de-usuario');
    });

    it('CHATWOOT_API_TOKEN_LECTURA vacío no bloquea production (decisión pendiente, P41)', () => {
      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        NODE_ENV: 'production',
        CHATWOOT_BOT_TOKEN: 'token-real',
        CHATWOOT_WEBHOOK_SECRETO: 'secreto-real',
        TELEGRAM_BOT_TOKEN: 'token-telegram',
        TELEGRAM_CHAT_ID: '123',
        OPENROUTER_API_KEY: 'clave-real',
      });

      expect(configuracion.CHATWOOT_API_TOKEN_LECTURA).toBeUndefined();
    });

    it('rechaza CHATWOOT_URL que no es una URL', () => {
      const fuenteInvalida = { ...fuenteValida, CHATWOOT_URL: 'no-es-una-url' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'CHATWOOT_URL',
          problema: 'formato',
        });
      }
    });

    it('acepta CHATWOOT_ACCOUNT_ID coercible a entero', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, CHATWOOT_ACCOUNT_ID: '7' });

      expect(configuracion.CHATWOOT_ACCOUNT_ID).toBe(7);
    });

    it('D3 — secreto vacío en desarrollo/test no lanza (falla cerrada la aplica la guardia de firma, no la carga)', () => {
      expect(() => cargarConfiguracion(fuenteValida)).not.toThrow();
    });

    it('D3/D12 — CHATWOOT_WEBHOOK_SECRETO vacío en production lanza ConfiguracionInvalidaError', () => {
      const fuenteInvalida = { ...fuenteValida, NODE_ENV: 'production' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'CHATWOOT_WEBHOOK_SECRETO',
          problema: 'valor',
        });
      }
    });

    it('D12 — CHATWOOT_BOT_TOKEN vacío en production lanza ConfiguracionInvalidaError', () => {
      const fuenteInvalida = { ...fuenteValida, NODE_ENV: 'production' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'CHATWOOT_BOT_TOKEN',
          problema: 'valor',
        });
      }
    });

    it('acepta production cuando CHATWOOT_BOT_TOKEN y CHATWOOT_WEBHOOK_SECRETO vienen no vacíos', () => {
      const fuenteValidaProduccion = {
        ...fuenteValida,
        NODE_ENV: 'production',
        CHATWOOT_BOT_TOKEN: 'token-real',
        CHATWOOT_WEBHOOK_SECRETO: 'secreto-real',
        TELEGRAM_BOT_TOKEN: 'token-telegram',
        TELEGRAM_CHAT_ID: '-100123',
        OPENROUTER_API_KEY: 'clave-real',
      };

      expect(() => cargarConfiguracion(fuenteValidaProduccion)).not.toThrow();
    });
  });

  describe('Variables TELEGRAM_*/LEADS_* (fase-08-leads-handoff, T6, D11)', () => {
    function variablesRechazadas(fuente: Readonly<Record<string, string | undefined>>): readonly VariableInvalida[] {
      try {
        cargarConfiguracion(fuente);
      } catch (error) {
        if (error instanceof ConfiguracionInvalidaError) {
          return error.variables;
        }
        throw error;
      }
      return [];
    }

    it('usa los valores por defecto de D11 cuando ninguna variable viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.TELEGRAM_BOT_TOKEN).toBe('');
      expect(configuracion.TELEGRAM_CHAT_ID).toBe('');
      expect(configuracion.TELEGRAM_API_URL).toBe('https://api.telegram.org');
      expect(configuracion.TELEGRAM_HTTP_TIMEOUT_MS).toBe(5000);
      expect(configuracion.LEADS_VENTANA_NOTIFICACION_H).toBe(24);
      expect(configuracion.LEADS_RECORDATORIO_MIN).toBe(30);
      expect(configuracion.LEADS_BARRIDO_MS).toBe(60000);
    });

    it('LEADS_RECORDATORIO_MIN fuera de 1-1440 y LEADS_BARRIDO_MS menor que 1000 se rechazan', () => {
      expect(variablesRechazadas({ ...fuenteValida, LEADS_RECORDATORIO_MIN: '0' })).toContainEqual({
        nombre: 'LEADS_RECORDATORIO_MIN',
        problema: 'valor',
      });
      expect(variablesRechazadas({ ...fuenteValida, LEADS_RECORDATORIO_MIN: '1441' })).toContainEqual({
        nombre: 'LEADS_RECORDATORIO_MIN',
        problema: 'valor',
      });
      expect(variablesRechazadas({ ...fuenteValida, LEADS_BARRIDO_MS: '999' })).toContainEqual({
        nombre: 'LEADS_BARRIDO_MS',
        problema: 'valor',
      });
    });

    it('LEADS_VENTANA_NOTIFICACION_H fuera de 1-168 se rechaza (R11)', () => {
      expect(variablesRechazadas({ ...fuenteValida, LEADS_VENTANA_NOTIFICACION_H: '0' })).toContainEqual({
        nombre: 'LEADS_VENTANA_NOTIFICACION_H',
        problema: 'valor',
      });
      expect(variablesRechazadas({ ...fuenteValida, LEADS_VENTANA_NOTIFICACION_H: '169' })).toContainEqual({
        nombre: 'LEADS_VENTANA_NOTIFICACION_H',
        problema: 'valor',
      });
    });

    it('TELEGRAM_API_URL que no es una URL se rechaza', () => {
      expect(variablesRechazadas({ ...fuenteValida, TELEGRAM_API_URL: 'no-es-url' })).toContainEqual({
        nombre: 'TELEGRAM_API_URL',
        problema: 'formato',
      });
    });

    it('TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID vacíos en production se rechazan', () => {
      const fuenteProduccion = {
        ...fuenteValida,
        NODE_ENV: 'production',
        CHATWOOT_BOT_TOKEN: 'token-real',
        CHATWOOT_WEBHOOK_SECRETO: 'secreto-real',
        OPENROUTER_API_KEY: 'clave-real',
      };
      const sinTelegram = variablesRechazadas(fuenteProduccion);

      expect(sinTelegram).toContainEqual({ nombre: 'TELEGRAM_BOT_TOKEN', problema: 'valor' });
      expect(sinTelegram).toContainEqual({ nombre: 'TELEGRAM_CHAT_ID', problema: 'valor' });
      expect(() =>
        cargarConfiguracion({ ...fuenteProduccion, TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '-1' }),
      ).not.toThrow();
    });
  });

  describe('Variables COLAS_*/INBOX_* (fase-04-canal-chatwoot, T4, D6/D7)', () => {
    it('usa los valores de desarrollo por defecto cuando ninguna variable viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.COLAS_PREFIJO).toBe('luxe:colas');
      expect(configuracion.COLAS_TRABAJADORES).toBe(true);
      expect(configuracion.INBOX_MAX_INTENTOS).toBe(5);
      expect(configuracion.INBOX_BARRIDO_MS).toBe(30000);
    });

    it('acepta COLAS_TRABAJADORES="false" y lo convierte a boolean', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, COLAS_TRABAJADORES: 'false' });

      expect(configuracion.COLAS_TRABAJADORES).toBe(false);
    });

    it('rechaza COLAS_TRABAJADORES con un valor que no sea "true" ni "false"', () => {
      const fuenteInvalida = { ...fuenteValida, COLAS_TRABAJADORES: 'yes' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'COLAS_TRABAJADORES',
          problema: 'valor',
        });
      }
    });

    it('acepta INBOX_MAX_INTENTOS coercible a entero', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, INBOX_MAX_INTENTOS: '3' });

      expect(configuracion.INBOX_MAX_INTENTOS).toBe(3);
    });
  });

  describe('Variables OUTBOX_* (fase-04-canal-chatwoot, T6, D10/D12)', () => {
    it('usa los valores de desarrollo por defecto cuando ninguna variable viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.OUTBOX_MAX_INTENTOS).toBe(5);
      expect(configuracion.OUTBOX_BACKOFF_BASE_S).toBe(15);
      expect(configuracion.OUTBOX_BACKOFF_MAX_S).toBe(300);
      expect(configuracion.OUTBOX_BARRIDO_MS).toBe(5000);
      expect(configuracion.OUTBOX_LEASE_S).toBe(60);
    });

    it('acepta OUTBOX_MAX_INTENTOS coercible a entero', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, OUTBOX_MAX_INTENTOS: '3' });

      expect(configuracion.OUTBOX_MAX_INTENTOS).toBe(3);
    });

    it('acepta OUTBOX_BACKOFF_BASE_S y OUTBOX_BACKOFF_MAX_S coercibles a entero', () => {
      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        OUTBOX_BACKOFF_BASE_S: '30',
        OUTBOX_BACKOFF_MAX_S: '600',
      });

      expect(configuracion.OUTBOX_BACKOFF_BASE_S).toBe(30);
      expect(configuracion.OUTBOX_BACKOFF_MAX_S).toBe(600);
    });

    it('rechaza OUTBOX_LEASE_S por debajo del mínimo (10 s)', () => {
      const fuenteInvalida = { ...fuenteValida, OUTBOX_LEASE_S: '5' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'OUTBOX_LEASE_S',
          problema: 'valor',
        });
      }
    });
  });

  describe('Variables HUMANO_TTL_HORAS/HANDOFF_TTL_MIN (fase-05-conversaciones, T1, D3/Q2)', () => {
    it('usa los valores calibrados del prototipo por defecto cuando ninguna variable viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.HUMANO_TTL_HORAS).toBe(3);
      expect(configuracion.HANDOFF_TTL_MIN).toBe(45);
    });

    it('acepta HUMANO_TTL_HORAS coercible a número, incluido un valor fraccionario', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, HUMANO_TTL_HORAS: '1.5' });

      expect(configuracion.HUMANO_TTL_HORAS).toBe(1.5);
    });

    it('rechaza HUMANO_TTL_HORAS por debajo del mínimo (0.5 h)', () => {
      const fuenteInvalida = { ...fuenteValida, HUMANO_TTL_HORAS: '0.1' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'HUMANO_TTL_HORAS',
          problema: 'valor',
        });
      }
    });

    it('acepta HANDOFF_TTL_MIN coercible a entero', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, HANDOFF_TTL_MIN: '60' });

      expect(configuracion.HANDOFF_TTL_MIN).toBe(60);
    });

    it('rechaza HANDOFF_TTL_MIN por debajo del mínimo (1 min)', () => {
      const fuenteInvalida = { ...fuenteValida, HANDOFF_TTL_MIN: '0' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'HANDOFF_TTL_MIN',
          problema: 'valor',
        });
      }
    });
  });

  describe('Variables LOCK_TURNO_TTL_S/RATE_LIMIT_* (fase-05-conversaciones, T3, D7/R13)', () => {
    it('usa los valores calibrados del prototipo por defecto cuando ninguna variable viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.LOCK_TURNO_TTL_S).toBe(30);
      expect(configuracion.RATE_LIMIT_POR_HORA).toBe(20);
      expect(configuracion.RATE_LIMIT_POR_DIA).toBe(60);
    });

    it('rechaza LOCK_TURNO_TTL_S por debajo del mínimo (5 s)', () => {
      const fuenteInvalida = { ...fuenteValida, LOCK_TURNO_TTL_S: '1' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'LOCK_TURNO_TTL_S',
          problema: 'valor',
        });
      }
    });

    it('acepta RATE_LIMIT_POR_HORA/RATE_LIMIT_POR_DIA coercibles a entero', () => {
      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        RATE_LIMIT_POR_HORA: '5',
        RATE_LIMIT_POR_DIA: '15',
      });

      expect(configuracion.RATE_LIMIT_POR_HORA).toBe(5);
      expect(configuracion.RATE_LIMIT_POR_DIA).toBe(15);
    });
  });

  describe('Variables DEBOUNCE_MS/CONVERSACIONES_CONCURRENCIA (fase-05-conversaciones, T4, D6/D7)', () => {
    it('usa los valores calibrados del prototipo por defecto cuando ninguna variable viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.DEBOUNCE_MS).toBe(3000);
      expect(configuracion.CONVERSACIONES_CONCURRENCIA).toBe(10);
    });

    it('rechaza DEBOUNCE_MS por debajo del mínimo (500 ms)', () => {
      const fuenteInvalida = { ...fuenteValida, DEBOUNCE_MS: '100' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'DEBOUNCE_MS',
          problema: 'valor',
        });
      }
    });

    it('acepta CONVERSACIONES_CONCURRENCIA coercible a entero', () => {
      const configuracion = cargarConfiguracion({ ...fuenteValida, CONVERSACIONES_CONCURRENCIA: '3' });

      expect(configuracion.CONVERSACIONES_CONCURRENCIA).toBe(3);
    });
  });

  describe('Variable CONVERSACIONES_BARRIDO_MS (fase-05-conversaciones, T7, D11)', () => {
    it('usa el valor calibrado del prototipo por defecto cuando la variable no viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.CONVERSACIONES_BARRIDO_MS).toBe(300000);
    });

    it('rechaza CONVERSACIONES_BARRIDO_MS por debajo del mínimo (10000 ms)', () => {
      const fuenteInvalida = { ...fuenteValida, CONVERSACIONES_BARRIDO_MS: '1000' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'CONVERSACIONES_BARRIDO_MS',
          problema: 'valor',
        });
      }
    });
  });

  describe('Variable HANDOFF_ESPERA_MIN (fase-05-conversaciones, T8, D12)', () => {
    it('usa el valor calibrado del prototipo por defecto cuando la variable no viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.HANDOFF_ESPERA_MIN).toBe(30);
    });

    it('rechaza HANDOFF_ESPERA_MIN por debajo del mínimo (1 min)', () => {
      const fuenteInvalida = { ...fuenteValida, HANDOFF_ESPERA_MIN: '0' };

      expect.assertions(1);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).variables).toContainEqual({
          nombre: 'HANDOFF_ESPERA_MIN',
          problema: 'valor',
        });
      }
    });
  });

  describe('Variables LLM_*/OPENROUTER_* (fase-06-pasarela-llm, T3, D3/D12, R15)', () => {
    function variablesRechazadas(
      fuente: Readonly<Record<string, string | undefined>>,
    ): readonly VariableInvalida[] {
      try {
        cargarConfiguracion(fuente);
      } catch (error) {
        if (error instanceof ConfiguracionInvalidaError) {
          return error.variables;
        }
        throw error;
      }
      throw new Error('La configuración se aceptó y debía rechazarse');
    }

    it('usa los valores de D12 por defecto cuando ninguna variable LLM_* viene', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.LLM_CONVERSACION_MODELOS).toEqual(['openai/gpt-5.6-luna']);
      expect(configuracion.LLM_CONVERSACION_TIMEOUT_MS).toBe(15000);
      expect(configuracion.LLM_CONVERSACION_MAX_TOKENS).toBe(400);
      expect(configuracion.LLM_CONVERSACION_MAX_REINTENTOS).toBe(2);
      expect(configuracion.LLM_EVALS_MODELOS).toEqual(['openai/gpt-5.6-luna']);
      expect(configuracion.LLM_EVALS_TIMEOUT_MS).toBe(30000);
      expect(configuracion.LLM_TECHO_MENSUAL_USD).toBe(10);
      expect(configuracion.LLM_UMBRAL_AVISO_PCT).toBe(80);
      expect(configuracion.LLM_REINTENTO_BASE_MS).toBe(500);
      expect(configuracion.LLM_REINTENTO_MAX_MS).toBe(2000);
      expect(configuracion.LLM_CB_UMBRAL_FALLOS).toBe(5);
      expect(configuracion.LLM_CB_VENTANA_S).toBe(60);
      expect(configuracion.OPENROUTER_API_KEY).toBe('');
      expect(configuracion.OPENROUTER_BASE_URL).toBe('https://openrouter.ai/api/v1');
      expect(configuracion.LLM_PRECIOS_USD_JSON).toEqual({
        'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 },
      });
    });

    it('interpreta las listas de modelos como CSV en orden de prioridad, sin espacios sobrantes', () => {
      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        LLM_CONVERSACION_MODELOS: ' modelo-a , modelo-b ',
        LLM_PRECIOS_USD_JSON: JSON.stringify({
          'modelo-a': { entrada: 1, salida: 2, cache: 0 },
          'modelo-b': { entrada: 3, salida: 4, cache: 0 },
          'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 },
        }),
      });

      expect(configuracion.LLM_CONVERSACION_MODELOS).toEqual(['modelo-a', 'modelo-b']);
    });

    it('LLM3 — Timeout de conversación por debajo del TTL del lock de turno', () => {
      const conDefectos = cargarConfiguracion(fuenteValida);
      const justoDebajo = cargarConfiguracion({
        ...fuenteValida,
        LLM_CONVERSACION_TIMEOUT_MS: '29999',
      });

      expect(conDefectos.LLM_CONVERSACION_TIMEOUT_MS).toBeLessThan(
        conDefectos.LOCK_TURNO_TTL_S * 1000,
      );
      expect(justoDebajo.LLM_CONVERSACION_TIMEOUT_MS).toBe(29999);
      expect(
        variablesRechazadas({ ...fuenteValida, LLM_CONVERSACION_TIMEOUT_MS: '30000' }),
      ).toContainEqual({ nombre: 'LLM_CONVERSACION_TIMEOUT_MS', problema: 'valor' });
      expect(
        variablesRechazadas({ ...fuenteValida, LOCK_TURNO_TTL_S: '10' }),
      ).toContainEqual({ nombre: 'LLM_CONVERSACION_TIMEOUT_MS', problema: 'valor' });
    });

    it('LLM12 — Configuración LLM inválida impide el arranque nombrando la variable', () => {
      expect(variablesRechazadas({ ...fuenteValida, LLM_CONVERSACION_TIMEOUT_MS: '0' })).toContainEqual({
        nombre: 'LLM_CONVERSACION_TIMEOUT_MS',
        problema: 'valor',
      });
      expect(variablesRechazadas({ ...fuenteValida, LLM_CONVERSACION_MODELOS: ' , ' })).toContainEqual({
        nombre: 'LLM_CONVERSACION_MODELOS',
        problema: 'valor',
      });
      expect(variablesRechazadas({ ...fuenteValida, LLM_TECHO_MENSUAL_USD: '0' })).toContainEqual({
        nombre: 'LLM_TECHO_MENSUAL_USD',
        problema: 'valor',
      });
      expect(variablesRechazadas({ ...fuenteValida, LLM_UMBRAL_AVISO_PCT: '100' })).toContainEqual({
        nombre: 'LLM_UMBRAL_AVISO_PCT',
        problema: 'valor',
      });
      expect(variablesRechazadas({ ...fuenteValida, LLM_PRECIOS_USD_JSON: '{no es json' })).toContainEqual({
        nombre: 'LLM_PRECIOS_USD_JSON',
        problema: 'valor',
      });
      expect(
        variablesRechazadas({
          ...fuenteValida,
          LLM_REINTENTO_BASE_MS: '3000',
          LLM_REINTENTO_MAX_MS: '2000',
        }),
      ).toContainEqual({ nombre: 'LLM_REINTENTO_BASE_MS', problema: 'valor' });
    });

    it('LLM12 — un modelo de un perfil sin precio declarado impide el arranque sin imprimir su valor', () => {
      const fuenteInvalida = {
        ...fuenteValida,
        LLM_EVALS_MODELOS: 'openai/gpt-5.6-luna,modelo-secreto-sin-precio',
      };

      expect(variablesRechazadas(fuenteInvalida)).toContainEqual({
        nombre: 'LLM_EVALS_MODELOS',
        problema: 'valor',
      });
      expect.assertions(3);
      try {
        cargarConfiguracion(fuenteInvalida);
      } catch (error) {
        expect((error as ConfiguracionInvalidaError).message).toContain('LLM_EVALS_MODELOS');
        expect((error as ConfiguracionInvalidaError).message).not.toContain(
          'modelo-secreto-sin-precio',
        );
      }
    });

    it('acepta dos perfiles que solo difieren en la lista de modelos (LLM12, R15)', () => {
      const precios = JSON.stringify({
        'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 },
        'otra/marca': { entrada: 0.5, salida: 2, cache: 0.05 },
      });

      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        LLM_PRECIOS_USD_JSON: precios,
        LLM_EVALS_MODELOS: 'otra/marca',
      });

      expect(configuracion.LLM_CONVERSACION_MODELOS).toEqual(['openai/gpt-5.6-luna']);
      expect(configuracion.LLM_EVALS_MODELOS).toEqual(['otra/marca']);
    });

    it('OPENROUTER_API_KEY vacía en production lanza ConfiguracionInvalidaError', () => {
      const fuenteProduccion = {
        ...fuenteValida,
        NODE_ENV: 'production',
        CHATWOOT_BOT_TOKEN: 'token-real',
        CHATWOOT_WEBHOOK_SECRETO: 'secreto-real',
        TELEGRAM_BOT_TOKEN: 'token-telegram',
        TELEGRAM_CHAT_ID: '-100123',
      };

      expect(variablesRechazadas(fuenteProduccion)).toContainEqual({
        nombre: 'OPENROUTER_API_KEY',
        problema: 'valor',
      });
      expect(() =>
        cargarConfiguracion({ ...fuenteProduccion, OPENROUTER_API_KEY: 'clave-real' }),
      ).not.toThrow();
    });
  });

  describe('Proveedores de LLM por prefijo (proveedores-llm-configurables, T2, D4)', () => {
    const preciosOpenai = JSON.stringify({
      'openai:gpt-modelo': { entrada: 1, salida: 2, cache: 0.1 },
    });
    const fuenteProduccion = {
      ...fuenteValida,
      NODE_ENV: 'production',
      CHATWOOT_BOT_TOKEN: 'token-real',
      CHATWOOT_WEBHOOK_SECRETO: 'secreto-real',
      TELEGRAM_BOT_TOKEN: 'token-telegram',
      TELEGRAM_CHAT_ID: '-100123',
    };
    const fuenteSoloOpenai = {
      ...fuenteProduccion,
      LLM_CONVERSACION_MODELOS: 'openai:gpt-modelo',
      LLM_EVALS_MODELOS: 'openai:gpt-modelo',
      LLM_PRECIOS_USD_JSON: preciosOpenai,
    };

    function rechazo(fuente: Readonly<Record<string, string | undefined>>): ConfiguracionInvalidaError {
      try {
        cargarConfiguracion(fuente);
      } catch (error) {
        if (error instanceof ConfiguracionInvalidaError) return error;
        throw error;
      }
      throw new Error('La configuración se aceptó y debía rechazarse');
    }

    it('LLM15 — sin configuración nueva OPENAI_API_KEY queda vacía y todo va a OpenRouter', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.OPENAI_API_KEY).toBe('');
      expect(configuracion.LLM_CONVERSACION_MODELOS).toEqual(['openai/gpt-5.6-luna']);
    });

    it('LLM16 — Un prefijo de proveedor desconocido impide el arranque', () => {
      const error = rechazo({
        ...fuenteValida,
        LLM_CONVERSACION_MODELOS: 'desconocido:modelo-x',
        LLM_PRECIOS_USD_JSON: JSON.stringify({
          'desconocido:modelo-x': { entrada: 1, salida: 2, cache: 0 },
        }),
      });

      expect(error.variables).toContainEqual({ nombre: 'LLM_CONVERSACION_MODELOS', problema: 'valor' });
    });

    it('LLM16 — Un id de OpenRouter con barra o sufijo :free se acepta como está', () => {
      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        LLM_CONVERSACION_MODELOS: 'meta-llama/llama-3-8b:free,openai/gpt-5.6-luna',
        LLM_PRECIOS_USD_JSON: JSON.stringify({
          'meta-llama/llama-3-8b:free': { entrada: 0, salida: 0, cache: 0 },
          'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 },
        }),
      });

      expect(configuracion.LLM_CONVERSACION_MODELOS).toEqual([
        'meta-llama/llama-3-8b:free',
        'openai/gpt-5.6-luna',
      ]);
    });

    it('LLM17 — Producción exige la clave de cada proveedor usado', () => {
      const error = rechazo({ ...fuenteSoloOpenai, OPENROUTER_API_KEY: 'clave-openrouter' });

      expect(error.variables).toContainEqual({ nombre: 'OPENAI_API_KEY', problema: 'valor' });
      expect(() =>
        cargarConfiguracion({ ...fuenteSoloOpenai, OPENAI_API_KEY: 'clave-openai' }),
      ).not.toThrow();
    });

    it('LLM17 — Un proveedor sin uso no exige clave', () => {
      const conOpenrouter = cargarConfiguracion({
        ...fuenteProduccion,
        OPENROUTER_API_KEY: 'clave-openrouter',
      });

      expect(conOpenrouter.OPENAI_API_KEY).toBe('');
      // Con todos los modelos en OpenAI, la clave de OpenRouter deja de ser obligatoria.
      expect(() =>
        cargarConfiguracion({ ...fuenteSoloOpenai, OPENAI_API_KEY: 'clave-openai' }),
      ).not.toThrow();
    });

    it('LLM17 — Fuera de production ninguna clave es obligatoria', () => {
      expect(() =>
        cargarConfiguracion({
          ...fuenteValida,
          LLM_CONVERSACION_MODELOS: 'openai:gpt-modelo',
          LLM_PRECIOS_USD_JSON: preciosOpenai,
          LLM_EVALS_MODELOS: 'openai:gpt-modelo',
        }),
      ).not.toThrow();
    });

    it('LLM17 — un perfil mixto exige la clave de OpenRouter y la de OpenAI', () => {
      const mixta = {
        ...fuenteProduccion,
        LLM_CONVERSACION_MODELOS: 'openai:gpt-modelo,openai/gpt-5.6-luna',
        LLM_PRECIOS_USD_JSON: JSON.stringify({
          'openai:gpt-modelo': { entrada: 1, salida: 2, cache: 0.1 },
          'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 },
        }),
      };

      expect(rechazo(mixta).variables).toEqual(
        expect.arrayContaining([
          { nombre: 'OPENROUTER_API_KEY', problema: 'valor' },
          { nombre: 'OPENAI_API_KEY', problema: 'valor' },
        ]),
      );
    });

    it('LLM19 — Un perfil con un modelo sin precio impide el arranque', () => {
      const error = rechazo({
        ...fuenteValida,
        LLM_CONVERSACION_MODELOS: 'openai:gpt-modelo',
      });

      expect(error.variables).toContainEqual({ nombre: 'LLM_CONVERSACION_MODELOS', problema: 'valor' });
    });

    it('LLM19 — El precio se busca con el id completo, con prefijo', () => {
      const configuracion = cargarConfiguracion({
        ...fuenteValida,
        LLM_CONVERSACION_MODELOS: 'openai:gpt-modelo',
        LLM_EVALS_MODELOS: 'openai:gpt-modelo',
        LLM_PRECIOS_USD_JSON: preciosOpenai,
      });

      expect(configuracion.LLM_PRECIOS_USD_JSON['openai:gpt-modelo']).toEqual({
        entrada: 1,
        salida: 2,
        cache: 0.1,
      });
    });

    it('LLM24 — El error nombra la variable y nunca imprime el valor de una clave', () => {
      const error = rechazo({
        ...fuenteSoloOpenai,
        OPENROUTER_API_KEY: 'sk-or-valor-secreto-1',
        OPENAI_API_KEY: '',
        LLM_CONVERSACION_MODELOS: 'desconocido:modelo-x,openai:gpt-modelo',
      });

      expect(error.message).toContain('OPENAI_API_KEY');
      expect(error.message).not.toContain('sk-or-valor-secreto-1');
      expect(JSON.stringify(error.variables)).not.toContain('sk-or-valor-secreto-1');
    });
  });

  describe('Variables AGENTE_TOPE_TURNOS/AGENTE_SESION_TTL_H (fase-07a-turno-y-politicas, T4, D10)', () => {
    function variablesRechazadas(
      fuente: Readonly<Record<string, string | undefined>>,
    ): readonly VariableInvalida[] {
      try {
        cargarConfiguracion(fuente);
      } catch (error) {
        if (error instanceof ConfiguracionInvalidaError) {
          return error.variables;
        }
        throw error;
      }
      throw new Error('La configuración se aceptó y debía rechazarse');
    }

    it('usa el tope del prototipo (12 turnos) y 168 h de vida de sesión por defecto', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.AGENTE_TOPE_TURNOS).toBe(12);
      expect(configuracion.AGENTE_SESION_TTL_H).toBe(168);
    });

    it('rechaza AGENTE_TOPE_TURNOS menor que 1 o no entero', () => {
      expect(variablesRechazadas({ ...fuenteValida, AGENTE_TOPE_TURNOS: '0' })).toContainEqual({
        nombre: 'AGENTE_TOPE_TURNOS',
        problema: 'valor',
      });
      expect(
        variablesRechazadas({ ...fuenteValida, AGENTE_TOPE_TURNOS: '2.5' }).map((variable) => variable.nombre),
      ).toContain('AGENTE_TOPE_TURNOS');
    });

    it('rechaza AGENTE_SESION_TTL_H fuera del rango 1-720', () => {
      for (const valor of ['0', '721']) {
        expect(variablesRechazadas({ ...fuenteValida, AGENTE_SESION_TTL_H: valor })).toContainEqual({
          nombre: 'AGENTE_SESION_TTL_H',
          problema: 'valor',
        });
      }
      expect(cargarConfiguracion({ ...fuenteValida, AGENTE_SESION_TTL_H: '720' }).AGENTE_SESION_TTL_H).toBe(720);
    });
  });
  describe('Variable CATALOGO_GENERAR_COLLAGE (fase-08b, IMP15)', () => {
    it('IMP15 — por defecto el collage está apagado y acepta true o false', () => {
      expect(cargarConfiguracion(fuenteValida).CATALOGO_GENERAR_COLLAGE).toBe(false);
      expect(cargarConfiguracion({ ...fuenteValida, CATALOGO_GENERAR_COLLAGE: 'true' }).CATALOGO_GENERAR_COLLAGE).toBe(true);
      expect(cargarConfiguracion({ ...fuenteValida, CATALOGO_GENERAR_COLLAGE: 'false' }).CATALOGO_GENERAR_COLLAGE).toBe(false);
    });

    it('rechaza un valor que no sea true o false', () => {
      expect(() => cargarConfiguracion({ ...fuenteValida, CATALOGO_GENERAR_COLLAGE: 'si' })).toThrow(ConfiguracionInvalidaError);
    });
  });

  describe('Variables AGENTE_MAX_VUELTAS/AGENTE_HISTORIAL_TURNOS/AGENTE_FOTOS_INDIVIDUALES_MAX (fase-07b, D10)', () => {
    function nombresRechazados(fuente: Readonly<Record<string, string | undefined>>): readonly string[] {
      try {
        cargarConfiguracion(fuente);
      } catch (error) {
        if (error instanceof ConfiguracionInvalidaError) {
          return error.variables.map((variable) => variable.nombre);
        }
        throw error;
      }
      throw new Error('La configuración se aceptó y debía rechazarse');
    }

    it('aplica los defaults 5, 6 y 4', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.AGENTE_MAX_VUELTAS).toBe(5);
      expect(configuracion.AGENTE_HISTORIAL_TURNOS).toBe(6);
      expect(configuracion.AGENTE_FOTOS_INDIVIDUALES_MAX).toBe(4);
    });

    it('rechaza valores fuera de rango y acepta los bordes', () => {
      expect(nombresRechazados({ ...fuenteValida, AGENTE_MAX_VUELTAS: '0' })).toContain('AGENTE_MAX_VUELTAS');
      expect(nombresRechazados({ ...fuenteValida, AGENTE_MAX_VUELTAS: '9' })).toContain('AGENTE_MAX_VUELTAS');
      expect(nombresRechazados({ ...fuenteValida, AGENTE_HISTORIAL_TURNOS: '21' })).toContain(
        'AGENTE_HISTORIAL_TURNOS',
      );
      expect(nombresRechazados({ ...fuenteValida, AGENTE_FOTOS_INDIVIDUALES_MAX: '0' })).toContain(
        'AGENTE_FOTOS_INDIVIDUALES_MAX',
      );
      expect(cargarConfiguracion({ ...fuenteValida, AGENTE_HISTORIAL_TURNOS: '0' }).AGENTE_HISTORIAL_TURNOS).toBe(0);
      expect(cargarConfiguracion({ ...fuenteValida, AGENTE_MAX_VUELTAS: '8' }).AGENTE_MAX_VUELTAS).toBe(8);
    });
  });

  describe('Avisos al asesor (fase-08d, D1, D5)', () => {
    it('NTF5 — CHATWOOT_URL_PUBLICA es opcional y vacía cae en CHATWOOT_URL', () => {
      expect(cargarConfiguracion(fuenteValida).CHATWOOT_URL_PUBLICA).toBeUndefined();
      expect(cargarConfiguracion({ ...fuenteValida, CHATWOOT_URL_PUBLICA: '' }).CHATWOOT_URL_PUBLICA).toBeUndefined();
      expect(
        cargarConfiguracion({ ...fuenteValida, CHATWOOT_URL_PUBLICA: 'https://chat.ejemplo.co' }).CHATWOOT_URL_PUBLICA,
      ).toBe('https://chat.ejemplo.co');
    });

    it('NTF5 — CHATWOOT_URL_PUBLICA debe ser una URL', () => {
      expect(() => cargarConfiguracion({ ...fuenteValida, CHATWOOT_URL_PUBLICA: 'no es una url' })).toThrow(
        ConfiguracionInvalidaError,
      );
    });

    it('NTF7 — la espera del cliente avisa a los 10 minutos y el barrido corre cada 60 s por defecto', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.ESPERA_CLIENTE_MIN).toBe(10);
      expect(configuracion.ESPERA_CLIENTE_BARRIDO_MS).toBe(60000);
    });

    it('NTF7 — ESPERA_CLIENTE_MIN menor que 1 y ESPERA_CLIENTE_BARRIDO_MS menor que 10000 se rechazan', () => {
      expect(() => cargarConfiguracion({ ...fuenteValida, ESPERA_CLIENTE_MIN: '0' })).toThrow(ConfiguracionInvalidaError);
      expect(() => cargarConfiguracion({ ...fuenteValida, ESPERA_CLIENTE_BARRIDO_MS: '9999' })).toThrow(
        ConfiguracionInvalidaError,
      );
    });
  });

  describe('Sesiones y límite de intentos (fase-11a, T2, design.md «Configuración nueva»)', () => {
    function nombresRechazados(fuente: Readonly<Record<string, string | undefined>>): readonly string[] {
      try {
        cargarConfiguracion(fuente);
      } catch (error) {
        if (error instanceof ConfiguracionInvalidaError) {
          return error.variables.map((variable) => variable.nombre);
        }
        throw error;
      }
      return [];
    }

    it('USR3/USR8 — usa 720 min de inactividad, 168 h de máximo, 5 intentos y 15 min por defecto (P51, P53)', () => {
      const configuracion = cargarConfiguracion(fuenteValida);

      expect(configuracion.SESION_INACTIVIDAD_MIN).toBe(720);
      expect(configuracion.SESION_DURACION_MAX_H).toBe(168);
      expect(configuracion.AUTH_INTENTOS_MAX).toBe(5);
      expect(configuracion.AUTH_VENTANA_MIN).toBe(15);
    });

    it('rechaza cada variable fuera de su rango', () => {
      expect(nombresRechazados({ ...fuenteValida, SESION_INACTIVIDAD_MIN: '4' })).toContain('SESION_INACTIVIDAD_MIN');
      expect(nombresRechazados({ ...fuenteValida, SESION_INACTIVIDAD_MIN: '10081' })).toContain(
        'SESION_INACTIVIDAD_MIN',
      );
      expect(nombresRechazados({ ...fuenteValida, SESION_DURACION_MAX_H: '0' })).toContain('SESION_DURACION_MAX_H');
      expect(nombresRechazados({ ...fuenteValida, SESION_DURACION_MAX_H: '721' })).toContain('SESION_DURACION_MAX_H');
      expect(nombresRechazados({ ...fuenteValida, AUTH_INTENTOS_MAX: '0' })).toContain('AUTH_INTENTOS_MAX');
      expect(nombresRechazados({ ...fuenteValida, AUTH_INTENTOS_MAX: '51' })).toContain('AUTH_INTENTOS_MAX');
      expect(nombresRechazados({ ...fuenteValida, AUTH_VENTANA_MIN: '0' })).toContain('AUTH_VENTANA_MIN');
      expect(nombresRechazados({ ...fuenteValida, AUTH_VENTANA_MIN: '1441' })).toContain('AUTH_VENTANA_MIN');
    });

    it('USR3 — la duración máxima no puede ser menor que la inactividad', () => {
      // 600 min de inactividad = 10 h; un máximo de 9 h haría que la inactividad nunca aplicara.
      expect(
        nombresRechazados({ ...fuenteValida, SESION_INACTIVIDAD_MIN: '600', SESION_DURACION_MAX_H: '9' }),
      ).toEqual(['SESION_DURACION_MAX_H']);
      expect(
        cargarConfiguracion({ ...fuenteValida, SESION_INACTIVIDAD_MIN: '600', SESION_DURACION_MAX_H: '10' })
          .SESION_DURACION_MAX_H,
      ).toBe(10);
    });
  });
});
