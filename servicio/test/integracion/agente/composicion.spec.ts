import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { MotorTurno } from '../../../src/modulos/agente/aplicacion/motor-turno.js';
import { GENERADOR_RESPUESTA } from '../../../src/modulos/conversaciones/index.js';
import { AgenteEco } from '../../../src/modulos/conversaciones/aplicacion/agente-eco.js';
import { cargarConfiguracion, CONFIGURACION } from '../../../src/plataforma/config/index.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

/**
 * ADR-0016 / D4 de la Fase 07a: la aplicación completa compone el agente detrás del puerto de
 * `conversaciones`. Sin trabajadores de BullMQ y con la infraestructura real de la suite.
 */
async function compilarAplicacion() {
  const { AppModule } = await import('../../../src/app.module.js');
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas`,
    COLAS_TRABAJADORES: 'false',
  });
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  return modulo.createNestApplication();
}

describe('composición del agente en AppModule (ADR-0016)', () => {
  let app: Awaited<ReturnType<typeof compilarAplicacion>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('GENERADOR_RESPUESTA resuelve a MotorTurno y la aplicación arranca', async () => {
    app = await compilarAplicacion();
    await app.init();

    const generador = app.get<unknown>(GENERADOR_RESPUESTA, { strict: false });

    expect(generador).toBeInstanceOf(MotorTurno);
    expect(generador).not.toBeInstanceOf(AgenteEco);
  });
});
