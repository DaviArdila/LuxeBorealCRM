import { describe, expect, it } from 'vitest';
import { cargarConfiguracion } from './cargar-configuracion.js';
import { ConfiguracionInvalidaError } from './esquema.js';

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
      };

      expect(() => cargarConfiguracion(fuenteValidaProduccion)).not.toThrow();
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
});
