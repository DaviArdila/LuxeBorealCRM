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
  const reloj = new ClockFalso(ahora);
  return { repositorio: new RepositorioContactoAgentePrisma(prisma, reloj), prisma, reloj };
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

  it('PRV1 — Un contacto nuevo no tiene respuesta de consentimiento', async () => {
    const { repositorio, prisma } = await crearContexto();
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: 910_010 } });

    await expect(repositorio.consentimientoDe(contacto.id)).resolves.toBe('pendiente');
  });

  it('PRV1 — Aceptar guarda la fecha del reloj y deja el rechazo vacío', async () => {
    const { repositorio, prisma } = await crearContexto(new Date('2026-10-09T10:00:00.000Z'));
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: 910_011 } });

    await repositorio.registrarConsentimiento(contacto.id, true);

    const fila = await prisma.contacto.findUniqueOrThrow({ where: { id: contacto.id } });
    expect(fila.consentimientoDatosEn?.toISOString()).toBe('2026-10-09T10:00:00.000Z');
    expect(fila.consentimientoRechazadoEn).toBeNull();
    await expect(repositorio.consentimientoDe(contacto.id)).resolves.toBe('aceptado');
  });

  it('PRV1 — Rechazar guarda el rechazo y ningún otro dato', async () => {
    const { repositorio, prisma } = await crearContexto(new Date('2026-10-09T10:00:00.000Z'));
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: 910_012 } });

    await repositorio.registrarConsentimiento(contacto.id, false);

    const fila = await prisma.contacto.findUniqueOrThrow({ where: { id: contacto.id } });
    expect(fila.consentimientoRechazadoEn?.toISOString()).toBe('2026-10-09T10:00:00.000Z');
    expect(fila.consentimientoDatosEn).toBeNull();
    expect([fila.nombre, fila.direccion, fila.localidad, fila.telefonoAlterno]).toEqual([null, null, null, null]);
    await expect(repositorio.consentimientoDe(contacto.id)).resolves.toBe('rechazado');
  });

  it('PRV1 — Aceptar después de rechazar reemplaza el rechazo, y rechazar después de aceptar reemplaza la aceptación', async () => {
    const { repositorio, prisma, reloj } = await crearContexto(new Date('2026-10-09T10:00:00.000Z'));
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: 910_013 } });
    await repositorio.registrarConsentimiento(contacto.id, false);

    reloj.fijar(new Date('2026-10-09T11:00:00.000Z'));
    await repositorio.registrarConsentimiento(contacto.id, true);
    const aceptado = await prisma.contacto.findUniqueOrThrow({ where: { id: contacto.id } });
    expect(aceptado.consentimientoDatosEn?.toISOString()).toBe('2026-10-09T11:00:00.000Z');
    expect(aceptado.consentimientoRechazadoEn).toBeNull();

    reloj.fijar(new Date('2026-10-09T12:00:00.000Z'));
    await repositorio.registrarConsentimiento(contacto.id, false);
    const rechazado = await prisma.contacto.findUniqueOrThrow({ where: { id: contacto.id } });
    expect(rechazado.consentimientoRechazadoEn?.toISOString()).toBe('2026-10-09T12:00:00.000Z');
    expect(rechazado.consentimientoDatosEn).toBeNull();
  });

  it('AGT25 — Repetir la aceptación conserva la fecha original', async () => {
    const { repositorio, prisma, reloj } = await crearContexto(new Date('2026-10-09T10:00:00.000Z'));
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: 910_014 } });
    await repositorio.registrarConsentimiento(contacto.id, true);

    reloj.fijar(new Date('2026-10-09T11:00:00.000Z'));
    await repositorio.registrarConsentimiento(contacto.id, true);

    const fila = await prisma.contacto.findUniqueOrThrow({ where: { id: contacto.id } });
    expect(fila.consentimientoDatosEn?.toISOString()).toBe('2026-10-09T10:00:00.000Z');
  });

  it('PRV1 — El consentimiento vale en una conversación nueva del mismo contacto', async () => {
    const { repositorio, prisma } = await crearContexto();
    const contacto = await prisma.contacto.create({ data: { chatwootContactId: 910_015 } });
    await repositorio.registrarConsentimiento(contacto.id, true);

    // El estado cuelga del contacto, no de la conversación: otra lectura (otra conversación) lo ve igual.
    await expect(repositorio.consentimientoDe(contacto.id)).resolves.toBe('aceptado');
  });

  it('AGT25 — Registrar el consentimiento de un contacto inexistente falla y no se da por registrado', async () => {
    const { repositorio } = await crearContexto();

    await expect(repositorio.registrarConsentimiento(crypto.randomUUID(), true)).rejects.toThrow();
  });
});
