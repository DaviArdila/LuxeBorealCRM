import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AdministrarSeccionesEstilo } from '../../../src/modulos/agente/aplicacion/administrar-secciones-estilo.js';
import { PublicarEstilo } from '../../../src/modulos/agente/aplicacion/publicar-estilo.js';
import { RestaurarEstilo } from '../../../src/modulos/agente/aplicacion/restaurar-estilo.js';
import { MAX_CARACTERES_ESTILO } from '../../../src/modulos/agente/dominio/validar-estilo.js';
import { RepositorioEstiloPrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-estilo-prisma.js';
import { RepositorioSeccionesEstiloPrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-secciones-estilo-prisma.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { ClockSistema } from '../../../src/plataforma/reloj/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { VersionEstiloDePrueba } from '../../soporte/version-estilo-de-prueba.js';

// Estilo en secciones: administrar secciones y foto compuesta en `version_estilo`, atómicas, contra Postgres y Redis reales.

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto() {
  Logger.overrideLogger(false);
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
  });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule, RedisModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const prisma = modulo.get(PrismaService);
  await prisma.seccionEstilo.deleteMany();
  await prisma.versionEstilo.deleteMany();
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  if (redis.status === 'wait') await redis.connect();
  const version = new VersionEstiloDePrueba(redis);
  await redis.del(version.claveDePrueba);
  const repositorioEstilo = new RepositorioEstiloPrisma(prisma);
  const secciones = new RepositorioSeccionesEstiloPrisma(prisma);
  const clock = new ClockSistema();
  const publicar = new PublicarEstilo(repositorioEstilo, version, clock);
  return {
    prisma,
    version,
    repositorioEstilo,
    secciones,
    administrar: new AdministrarSeccionesEstilo(secciones, version, clock),
    publicar,
    restaurar: new RestaurarEstilo(repositorioEstilo, publicar),
  };
}

const entrada = (titulo: string, texto: string, activo = true) => ({ titulo, texto, activo });

describe('Secciones del estilo (integración)', () => {
  it('EST-S5 — Crear agrega la sección al final y guarda la foto compuesta como versión vigente con su autor', async () => {
    const { administrar, repositorioEstilo, prisma } = await crearContexto();
    const usuario = await prisma.usuario.create({
      data: { email: `secciones-${randomUUID()}@example.test`, nombre: 'Ana', passwordHash: 'hash-de-prueba', rol: 'admin' },
    });
    const autor = { id: usuario.id, nombre: 'Ana' };
    try {
      await administrar.crear(entrada('Saludo', 'Saluda una vez.'));

      const resultado = await administrar.crear(entrada('Cierre', 'Cierra con una pregunta.'), autor);

      expect(resultado).toMatchObject({ ok: true, version: 2, valor: { titulo: 'Cierre', orden: 1, activo: true } });
      await expect(repositorioEstilo.leerVigente()).resolves.toEqual({
        texto: '# Saludo\n\nSaluda una vez.\n\n# Cierre\n\nCierra con una pregunta.',
        version: 2,
        publicadoPor: autor,
      });
      expect((await prisma.versionEstilo.findMany({ where: { vigente: true } })).length).toBe(1);
    } finally {
      await prisma.versionEstilo.deleteMany();
      await prisma.usuario.delete({ where: { id: usuario.id } });
    }
  });

  it('EST-S5 — Crear sube la versión compartida de Redis', async () => {
    const { administrar, version } = await crearContexto();

    await administrar.crear(entrada('Saludo', 'Hola.'));
    await administrar.crear(entrada('Cierre', 'Chao.'));

    expect(await version.obtener()).toBe('2');
  });

  it('EST-S5 — Un título repetido (sin acentos ni mayúsculas) es duplicada y no deja foto', async () => {
    const { administrar, prisma } = await crearContexto();
    await administrar.crear(entrada('Cómo cierras', 'a'));

    await expect(administrar.crear(entrada('COMO CIERRAS', 'b'))).resolves.toEqual({ ok: false, razon: 'duplicada' });

    expect(await prisma.seccionEstilo.count()).toBe(1);
    expect(await prisma.versionEstilo.count()).toBe(1);
  });

  it('EST-S5 — Editar con la marca leída cambia la sección y guarda una foto nueva', async () => {
    const { administrar, repositorioEstilo } = await crearContexto();
    const creada = await administrar.crear(entrada('Saludo', 'Hola.'));
    if (!creada.ok) throw new Error('no se creó');

    const resultado = await administrar.editar(creada.valor.id, entrada('Saludo', 'Hola, qué gusto.'), creada.valor.actualizado);

    expect(resultado).toMatchObject({ ok: true, version: 2, valor: { texto: 'Hola, qué gusto.' } });
    await expect(repositorioEstilo.leerVigente()).resolves.toMatchObject({ texto: '# Saludo\n\nHola, qué gusto.', version: 2 });
  });

  it('EST-S5 — Editar con una marca vieja es modificado y no cambia nada (bloqueo optimista)', async () => {
    const { administrar, prisma } = await crearContexto();
    const creada = await administrar.crear(entrada('Saludo', 'Hola.'));
    if (!creada.ok) throw new Error('no se creó');
    await administrar.editar(creada.valor.id, entrada('Saludo', 'Primera edición.'), creada.valor.actualizado);

    const resultado = await administrar.editar(creada.valor.id, entrada('Saludo', 'Segunda edición.'), creada.valor.actualizado);

    expect(resultado).toEqual({ ok: false, razon: 'modificado' });
    expect((await prisma.seccionEstilo.findFirstOrThrow()).texto).toBe('Primera edición.');
    expect(await prisma.versionEstilo.count()).toBe(2);
  });

  it('EST-S5 — Editar una sección inexistente es inexistente', async () => {
    const { administrar } = await crearContexto();

    await expect(administrar.editar('0198a1b2-0000-7000-8000-0000000000ff', entrada('X', 'y'), new Date(0))).resolves.toEqual({
      ok: false,
      razon: 'inexistente',
    });
  });

  it('EST-S5 — Apagar una sección la quita del estilo compuesto; apagar la última se rechaza como estilo vacío', async () => {
    const { administrar, repositorioEstilo } = await crearContexto();
    const uno = await administrar.crear(entrada('Uno', 'a'));
    const dos = await administrar.crear(entrada('Dos', 'b'));
    if (!uno.ok || !dos.ok) throw new Error('no se crearon');

    const apagada = await administrar.editar(dos.valor.id, entrada('Dos', 'b', false), dos.valor.actualizado);
    await expect(repositorioEstilo.leerVigente()).resolves.toMatchObject({ texto: '# Uno\n\na' });
    const ultima = await administrar.editar(uno.valor.id, entrada('Uno', 'a', false), uno.valor.actualizado);

    expect(apagada).toMatchObject({ ok: true, version: 3 });
    expect(ultima).toMatchObject({ ok: false, razon: 'invalido', motivo: 'el estilo está vacío' });
    await expect(repositorioEstilo.leerVigente()).resolves.toMatchObject({ texto: '# Uno\n\na', version: 3 });
  });

  it('EST-S5 — Si el estilo compuesto pasaría el tope, el cambio se revierte entero: ni sección ni foto', async () => {
    const { administrar, prisma } = await crearContexto();
    await administrar.crear(entrada('Larga', 'a'.repeat(MAX_CARACTERES_ESTILO - 100)));

    const resultado = await administrar.crear(entrada('Otra', 'b'.repeat(500)));

    expect(resultado).toMatchObject({ ok: false, razon: 'invalido', motivo: `el estilo supera ${String(MAX_CARACTERES_ESTILO)} caracteres` });
    expect(JSON.stringify(resultado)).not.toContain('bbbb');
    expect(await prisma.seccionEstilo.count()).toBe(1);
    expect(await prisma.versionEstilo.count()).toBe(1);
  });

  it('EST-S5 — Un cambio que no altera el estilo compuesto no guarda foto ni sube la versión compartida', async () => {
    const { administrar, prisma, version } = await crearContexto();
    const uno = await administrar.crear(entrada('Uno', 'a'));
    const apagada = await administrar.crear(entrada('Apagada', 'x', false));
    if (!uno.ok || !apagada.ok) throw new Error('no se crearon');
    const antes = await version.obtener();

    const resultado = await administrar.editar(apagada.valor.id, entrada('Apagada', 'otro texto', false), apagada.valor.actualizado);

    expect(resultado).toMatchObject({ ok: true, version: null, valor: { texto: 'otro texto' } });
    expect(await prisma.versionEstilo.count()).toBe(1);
    expect(await version.obtener()).toBe(antes);
  });

  it('EST-S5 — Reordenar cambia el orden del compuesto; con ids que no son el conjunto exacto es no-coincide', async () => {
    const { administrar, repositorioEstilo } = await crearContexto();
    const uno = await administrar.crear(entrada('Uno', 'a'));
    const dos = await administrar.crear(entrada('Dos', 'b'));
    if (!uno.ok || !dos.ok) throw new Error('no se crearon');

    const resultado = await administrar.reordenar([dos.valor.id, uno.valor.id]);

    expect(resultado).toMatchObject({ ok: true, version: 3 });
    expect((await administrar.listar()).map((s) => [s.titulo, s.orden])).toEqual([
      ['Dos', 0],
      ['Uno', 1],
    ]);
    await expect(repositorioEstilo.leerVigente()).resolves.toMatchObject({ texto: '# Dos\n\nb\n\n# Uno\n\na' });
    await expect(administrar.reordenar([uno.valor.id])).resolves.toEqual({ ok: false, razon: 'no-coincide' });
    await expect(administrar.reordenar([uno.valor.id, uno.valor.id])).resolves.toEqual({ ok: false, razon: 'no-coincide' });
  });

  it('EST-S5 — El historial de fotos conserva solo diez versiones retiradas', async () => {
    const { administrar, repositorioEstilo } = await crearContexto();
    const creada = await administrar.crear(entrada('Saludo', 'v1'));
    if (!creada.ok) throw new Error('no se creó');
    let marca = creada.valor.actualizado;
    for (let i = 2; i <= 13; i += 1) {
      const editada = await administrar.editar(creada.valor.id, entrada('Saludo', `v${String(i)}`), marca);
      if (!editada.ok) throw new Error('no se editó');
      marca = editada.valor.actualizado;
    }

    expect((await repositorioEstilo.leerHistorial()).map((v) => v.version)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    await expect(repositorioEstilo.leerVigente()).resolves.toMatchObject({ version: 13, texto: '# Saludo\n\nv13' });
  });

  it('EST-S5 — Cuatro cambios simultáneos no repiten número de versión', async () => {
    const { administrar, repositorioEstilo } = await crearContexto();

    const resultados = await Promise.all(['A', 'B', 'C', 'D'].map((letra) => administrar.crear(entrada(`Sección ${letra}`, letra))));

    expect(resultados.every((r) => r.ok)).toBe(true);
    await expect(repositorioEstilo.leerVigente()).resolves.toMatchObject({ version: 4 });
    expect((await repositorioEstilo.leerHistorial()).map((v) => v.version).sort()).toEqual([1, 2, 3]);
  });

  it('EST-S6 — Publicar un estilo completo reemplaza las secciones con su división por encabezados', async () => {
    const { publicar, administrar, repositorioEstilo } = await crearContexto();
    await administrar.crear(entrada('Vieja', 'se va'));

    await publicar.ejecutar('Tono cálido.\n\n# Saludo\nHola.\n\n# Cierre\nChao.');

    expect((await administrar.listar()).map((s) => [s.orden, s.titulo, s.texto, s.activo])).toEqual([
      [0, 'General', 'Tono cálido.', true],
      [1, 'Saludo', 'Hola.', true],
      [2, 'Cierre', 'Chao.', true],
    ]);
    // La foto conserva el texto publicado tal cual.
    await expect(repositorioEstilo.leerVigente()).resolves.toMatchObject({
      texto: 'Tono cálido.\n\n# Saludo\nHola.\n\n# Cierre\nChao.',
      version: 2,
    });
  });

  it('EST-S6 — Restaurar una versión crea una versión nueva y reemplaza las secciones con las de esa foto', async () => {
    const { administrar, restaurar, repositorioEstilo } = await crearContexto();
    const uno = await administrar.crear(entrada('Uno', 'a'));
    await administrar.crear(entrada('Dos', 'b'));
    if (!uno.ok) throw new Error('no se creó');
    await administrar.editar(uno.valor.id, entrada('Uno', 'a', false), uno.valor.actualizado);

    const resultado = await restaurar.ejecutar(2);

    expect(resultado).toEqual({ publicado: true, version: 4 });
    expect((await administrar.listar()).map((s) => [s.titulo, s.activo])).toEqual([
      ['Uno', true],
      ['Dos', true],
    ]);
    await expect(repositorioEstilo.leerVigente()).resolves.toMatchObject({ texto: '# Uno\n\na\n\n# Dos\n\nb', version: 4 });
  });
});
