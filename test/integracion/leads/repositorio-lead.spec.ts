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

  describe('ventana de aviso por contacto (NTF2, D8)', () => {
    const AHORA = new Date('2026-09-30T15:00:00.000Z');
    const horas = (h: number): Date => new Date(AHORA.getTime() - h * 3_600_000);

    async function dosLeads() {
      const contexto = await crearContexto();
      const nuevo = (conversacionId: string | null) =>
        contexto.repositorio.crear({
          contactoId: contexto.contacto.id,
          conversacionId: conversacionId ?? contexto.conversacion.id,
          productoId: null,
          temperatura: 'caliente',
          senales: ['pide_pagar'],
          resumen: 'x',
          derivado: true,
        });
      const a = await nuevo(null);
      const b = await nuevo(null);
      return { ...contexto, a, b };
    }

    it('NTF2 — marca el lead si el contacto nunca fue avisado', async () => {
      const { repositorio, prisma, a, contacto } = await dosLeads();

      await expect(repositorio.marcarNotificado({ id: a.id, contactoId: contacto.id }, AHORA, horas(24))).resolves.toBe(true);

      const fila = await prisma.lead.findUniqueOrThrow({ where: { id: a.id } });
      expect(fila.notificadoEn?.toISOString()).toBe(AHORA.toISOString());
    });

    it('NTF2 — Ventana de 24 horas por contacto: otro lead avisado hace 3 horas bloquea', async () => {
      const { repositorio, prisma, a, b, contacto } = await dosLeads();
      await prisma.lead.update({ where: { id: a.id }, data: { notificadoEn: horas(3) } });

      await expect(repositorio.marcarNotificado({ id: b.id, contactoId: contacto.id }, AHORA, horas(24))).resolves.toBe(false);

      const fila = await prisma.lead.findUniqueOrThrow({ where: { id: b.id } });
      expect(fila.notificadoEn).toBeNull();
    });

    it('NTF2 — Pasada la ventana se vuelve a avisar (avisado hace 25 horas)', async () => {
      const { repositorio, prisma, a, b, contacto } = await dosLeads();
      await prisma.lead.update({ where: { id: a.id }, data: { notificadoEn: horas(25) } });

      await expect(repositorio.marcarNotificado({ id: b.id, contactoId: contacto.id }, AHORA, horas(24))).resolves.toBe(true);
    });

    it('NTF2 — Dos derivaciones simultáneas avisan una sola vez', async () => {
      const { repositorio, a, b, contacto } = await dosLeads();

      const resultados = await Promise.all([
        repositorio.marcarNotificado({ id: a.id, contactoId: contacto.id }, AHORA, horas(24)),
        repositorio.marcarNotificado({ id: b.id, contactoId: contacto.id }, AHORA, horas(24)),
      ]);

      expect(resultados.filter(Boolean)).toHaveLength(1);
    });

    it('desmarcar devuelve el lead a «sin avisar» para que otro intento pueda avisar', async () => {
      const { repositorio, prisma, a, contacto } = await dosLeads();
      await repositorio.marcarNotificado({ id: a.id, contactoId: contacto.id }, AHORA, horas(24));

      await repositorio.desmarcarNotificado(a.id);

      const fila = await prisma.lead.findUniqueOrThrow({ where: { id: a.id } });
      expect(fila.notificadoEn).toBeNull();
    });
  });
});
