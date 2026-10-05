import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositorioContactoAgentePrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-contacto-agente-prisma.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T7 (fase-07b): datos capturados por el agente en `contacto` contra Postgres real (AGT10, D6, P1).

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto(ahora = new Date('2026-09-30T15:00:00.000Z')) {
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
  });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const prisma = modulo.get(PrismaService);
  return { repositorio: new RepositorioContactoAgentePrisma(prisma, new ClockFalso(ahora)), prisma };
}

describe('RepositorioContactoAgentePrisma (T7, integración)', () => {
  it('AGT10 — Los datos quedan guardados en el contacto de la conversación', async () => {
    const { repositorio, prisma } = await crearContexto();
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: 910_001 } });

    await repositorio.guardarDatosCapturados(contacto.id, {
      nombre: 'Laura Gómez',
      telefonoAlterno: '3001234567',
      direccion: 'Calle 45 # 12-34',
      localidad: 'Chapinero',
    });

    const fila = await prisma.contacto.findUniqueOrThrow({ where: { id: contacto.id } });
    expect(fila).toMatchObject({
      nombre: 'Laura Gómez',
      telefonoAlterno: '3001234567',
      direccion: 'Calle 45 # 12-34',
      localidad: 'Chapinero',
    });
    expect(fila.actualizado.toISOString()).toBe('2026-09-30T15:00:00.000Z');
  });

  it('AGT10 — Sin teléfono alterno no deja ninguno guardado', async () => {
    const { repositorio, prisma } = await crearContexto();
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: 910_002, telefonoAlterno: '3009999999' } });

    await repositorio.guardarDatosCapturados(contacto.id, {
      nombre: 'Ana',
      telefonoAlterno: null,
      direccion: 'Carrera 7 # 1-1',
      localidad: 'Centro',
    });

    const fila = await prisma.contacto.findUniqueOrThrow({ where: { id: contacto.id } });
    expect(fila.telefonoAlterno).toBeNull();
  });

  it('leerNombre devuelve el nombre guardado o null si no hay', async () => {
    const { repositorio, prisma } = await crearContexto();
    const sinNombre = await prisma.contacto.create({ data: { chatwootContactId: 910_003 } });
    const conNombre = await prisma.contacto.create({ data: { chatwootContactId: 910_004, nombre: 'Marta' } });

    await expect(repositorio.leerNombre(sinNombre.id)).resolves.toBeNull();
    await expect(repositorio.leerNombre(conNombre.id)).resolves.toBe('Marta');
    await expect(repositorio.leerNombre(crypto.randomUUID())).resolves.toBeNull();
  });
});
