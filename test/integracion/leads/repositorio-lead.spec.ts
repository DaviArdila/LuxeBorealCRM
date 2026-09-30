import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositorioLeadPrisma } from '../../../src/modulos/leads/infraestructura/prisma/repositorio-lead-prisma.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T2 (fase-08): el repositorio de leads contra Postgres real (LDS2, D3).

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto() {
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
  const contacto = await prisma.contacto.create({ data: { chatwootContactId: 920_000 + Math.floor(Math.random() * 90_000) } });
  const conversacion = await prisma.conversacion.create({
    data: { contactoId: contacto.id, chatwootConversationId: 930_000 + Math.floor(Math.random() * 90_000), canal: 'whatsapp', estado: 'bot' },
  });
  const repositorio = new RepositorioLeadPrisma(prisma, new ClockFalso(new Date('2026-09-30T15:00:00.000Z')));
  return { repositorio, prisma, contacto, conversacion };
}

describe('RepositorioLeadPrisma (T2, integración)', () => {
  it('LDS2 — crea el lead con sus señales y lo encuentra como abierto de la conversación', async () => {
    const { repositorio, contacto, conversacion } = await crearContexto();

    const creado = await repositorio.crear({
      contactoId: contacto.id,
      conversacionId: conversacion.id,
      productoId: null,
      temperatura: 'caliente',
      senales: ['pide_pagar', 'pide_fotos'],
      resumen: 'Quiere pagar',
      derivado: true,
    });

    const abierto = await repositorio.obtenerAbiertoDeConversacion(conversacion.id);
    expect(abierto).toMatchObject({
      id: creado.id,
      contactoId: contacto.id,
      temperatura: 'caliente',
      senales: ['pide_pagar', 'pide_fotos'],
      derivado: true,
      estado: 'nuevo',
      capturadoFueraHorario: false,
      notificadoEn: null,
    });
  });

  it('LDS2 — actualizar cambia solo lo pedido y renueva `actualizado` con el reloj inyectado', async () => {
    const { repositorio, prisma, contacto, conversacion } = await crearContexto();
    const creado = await repositorio.crear({
      contactoId: contacto.id,
      conversacionId: conversacion.id,
      productoId: null,
      temperatura: 'tibio',
      senales: ['pregunta_precio'],
      resumen: 'Pregunta el precio',
      derivado: false,
    });

    const actualizado = await repositorio.actualizar(creado.id, { derivado: true, senales: ['pregunta_precio', 'pide_pagar'] });

    expect(actualizado).toMatchObject({ derivado: true, temperatura: 'tibio', resumen: 'Pregunta el precio' });
    const fila = await prisma.lead.findUniqueOrThrow({ where: { id: creado.id } });
    expect(fila.actualizado.toISOString()).toBe('2026-09-30T15:00:00.000Z');
  });

  it('un lead que ya no está en estado nuevo no es el abierto de la conversación', async () => {
    const { repositorio, prisma, contacto, conversacion } = await crearContexto();
    const creado = await repositorio.crear({
      contactoId: contacto.id,
      conversacionId: conversacion.id,
      productoId: null,
      temperatura: 'caliente',
      senales: ['pide_pagar'],
      resumen: 'x',
      derivado: true,
    });
    await prisma.lead.update({ where: { id: creado.id }, data: { estado: 'en_atencion' } });

    await expect(repositorio.obtenerAbiertoDeConversacion(conversacion.id)).resolves.toBeNull();
  });

  it('una conversación sin leads no tiene lead abierto', async () => {
    const { repositorio, conversacion } = await crearContexto();

    await expect(repositorio.obtenerAbiertoDeConversacion(conversacion.id)).resolves.toBeNull();
  });
});
