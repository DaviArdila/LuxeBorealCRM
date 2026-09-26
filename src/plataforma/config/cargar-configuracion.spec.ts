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
      const configuracion = cargarConfiguracion({ ...fuenteValida, NODE_ENV: 'production' });

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
});
