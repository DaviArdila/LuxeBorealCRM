import { describe, expect, it } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { RepositorioAdministracionEnMemoria } from '../../../../test/fakes/repositorio-administracion-en-memoria.js';
import { codificarCursor } from '../dominio/cursor.js';
import type { VersionAsistente } from '../puertos/version-asistente.js';
import { AdministrarCasos } from './administrar-casos.js';

// CAS3, CAS4, CAS5 y CAS10 (Fase 12, T7): administrar los casos y listarlos; la unicidad, el orden y el cursor reales se prueban
// contra Postgres en integración.

class VersionFalsa implements VersionAsistente {
  incrementos = 0;
  falla = false;
  obtener(): Promise<string> {
    return Promise.resolve(String(this.incrementos));
  }
  incrementar(): Promise<void> {
    if (this.falla) return Promise.reject(new Error('redis caído'));
    this.incrementos += 1;
    return Promise.resolve();
  }
}

const LEIDO = new Date('2026-10-06T10:00:00Z');

function crear() {
  const repositorio = new RepositorioAdministracionEnMemoria();
  const version = new VersionFalsa();
  const clock = new ClockFalso(new Date('2026-10-06T12:00:00Z'));
  const politicas = repositorio.sembrarCategoria('Políticas');
  const sistema = repositorio.sembrarCategoria('Sistema');
  return { admin: new AdministrarCasos(repositorio, version, clock), repositorio, version, clock, politicas, sistema };
}

const NUEVO = {
  titulo: 'Medios de pago',
  cuandoAplica: 'Cuando el cliente pregunta cómo puede pagar.',
  texto: 'Aceptamos transferencia bancaria.',
};

describe('asistente/aplicacion — AdministrarCasos (crear, CAS3 y CAS5)', () => {
  it('CAS3 — Crear un caso de intención lo deja activo, en modo literal y con disparador intencion', async () => {
    const { admin, politicas, version } = crear();

    const resultado = await admin.crear({ categoriaId: politicas.id, ...NUEVO });

    expect(resultado).toMatchObject({
      ok: true,
      caso: { titulo: 'Medios de pago', activo: true, modo: 'literal', disparador: 'intencion', claveSistema: null, categoriaNombre: 'Políticas' },
    });
    expect(version.incrementos).toBe(1);
  });

  it('CAS3 — El texto se guarda sin los espacios y saltos de línea de los bordes', async () => {
    const { admin, politicas } = crear();

    const resultado = await admin.crear({ categoriaId: politicas.id, ...NUEVO, texto: '\n  Aceptamos transferencia.  \n' });

    expect(resultado).toMatchObject({ ok: true, caso: { texto: 'Aceptamos transferencia.' } });
  });

  it('CAS1 — Un caso necesita una categoría que exista', async () => {
    const { admin, version } = crear();

    expect(await admin.crear({ categoriaId: 'no-existe', ...NUEVO })).toEqual({ ok: false, razon: 'categoria-inexistente' });
    expect(version.incrementos).toBe(0);
  });

  it('CAS1 — Dos casos no pueden tener el mismo título, sin distinguir mayúsculas ni acentos', async () => {
    const { admin, politicas } = crear();
    await admin.crear({ categoriaId: politicas.id, ...NUEVO, titulo: 'Garantía' });

    expect(await admin.crear({ categoriaId: politicas.id, ...NUEVO, titulo: 'garantia' })).toEqual({ ok: false, razon: 'duplicado' });
  });

  it.each([
    ['CAS5 — Un texto con un valor en pesos', { texto: 'Cuesta $ 45.000' }, 'el texto contiene un valor en pesos (R1, R2)'],
    ['CAS5 — Un texto con un SKU', { texto: 'Mira el SKU-GRF-001' }, 'el texto contiene un SKU (AGT16)'],
    ['CAS5 — Un texto con un marcador de plantilla', { texto: 'Hola {{nombre}}' }, 'el texto contiene un marcador de plantilla {{...}}'],
    ['CAS5 — Un texto vacío', { texto: '   ' }, 'el texto está vacío'],
    ['CAS5 — Un texto de 1.201 caracteres', { texto: 'a'.repeat(1201) }, 'el texto supera 1200 caracteres'],
    ['CAS5 — Un caso de intención sin «cuándo aplica»', { cuandoAplica: ' ' }, 'el «cuándo aplica» está vacío'],
    ['CAS5 — Un título de más de 80 caracteres', { titulo: 'a'.repeat(81) }, 'el título supera 80 caracteres'],
  ] as const)('%s se rechaza con su motivo', async (_nombre, cambios, motivo) => {
    const { admin, politicas, version } = crear();

    const resultado = await admin.crear({ categoriaId: politicas.id, ...NUEVO, ...cambios });

    expect(resultado).toEqual({ ok: false, razon: 'invalido', motivo });
    expect(version.incrementos).toBe(0);
  });

  it('CAS4 — La API no crea casos con clave del sistema', async () => {
    const { admin, politicas, repositorio } = crear();

    const resultado = await admin.crear({ categoriaId: politicas.id, ...NUEVO, claveSistema: 'mensaje_espera_handoff' });

    expect(resultado).toEqual({ ok: false, razon: 'invalido', motivo: 'los casos del sistema no se crean desde la API (CAS4)' });
    expect(repositorio.casos).toHaveLength(0);
  });
});

describe('asistente/aplicacion — AdministrarCasos (editar y borrar)', () => {
  it('CAS3 — Editar un caso de intención guarda el texto nuevo y una fecha de actualización posterior', async () => {
    const { admin, repositorio, politicas, clock, version } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía', actualizado: LEIDO });

    const resultado = await admin.editar(caso.id, { actualizado: LEIDO, texto: 'Cubre ocho días.' });

    expect(resultado).toMatchObject({ ok: true, caso: { texto: 'Cubre ocho días.', actualizado: clock.ahora() } });
    expect(clock.ahora().getTime()).toBeGreaterThan(LEIDO.getTime());
    expect(version.incrementos).toBe(1);
  });

  it('CAS3 — Una edición sobre una versión vieja se rechaza y no pisa el cambio ajeno', async () => {
    const { admin, repositorio, politicas, version } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía', texto: 'Texto del otro admin.', actualizado: new Date('2026-10-06T11:00:00Z') });

    const resultado = await admin.editar(caso.id, { actualizado: LEIDO, texto: 'Mi texto.' });

    expect(resultado).toEqual({ ok: false, razon: 'modificado' });
    expect(repositorio.casos[0]?.texto).toBe('Texto del otro admin.');
    expect(version.incrementos).toBe(0);
  });

  it('CAS3 — Desactivar un caso de intención lo deja en el listado como inactivo', async () => {
    const { admin, repositorio, politicas } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía', actualizado: LEIDO });

    const resultado = await admin.editar(caso.id, { actualizado: LEIDO, activo: false });

    expect(resultado).toMatchObject({ ok: true, caso: { activo: false } });
  });

  it('editar un caso que no existe responde inexistente', async () => {
    const { admin } = crear();

    expect(await admin.editar('no-existe', { actualizado: LEIDO, texto: 'Algo.' })).toEqual({ ok: false, razon: 'inexistente' });
  });

  it('editar con el título de otro caso o con una categoría inexistente se rechaza', async () => {
    const { admin, repositorio, politicas } = crear();
    repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Devoluciones' });
    const garantia = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía', actualizado: LEIDO });

    expect(await admin.editar(garantia.id, { actualizado: LEIDO, titulo: 'devoluciones' })).toEqual({ ok: false, razon: 'duplicado' });
    expect(await admin.editar(garantia.id, { actualizado: LEIDO, categoriaId: 'no-existe' })).toEqual({ ok: false, razon: 'categoria-inexistente' });
  });

  it('CAS5 — Editar con un texto inválido se rechaza con su motivo y no cambia nada', async () => {
    const { admin, repositorio, politicas } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía', texto: 'Original.', actualizado: LEIDO });

    const resultado = await admin.editar(caso.id, { actualizado: LEIDO, texto: 'Ahora $ 99.000' });

    expect(resultado).toEqual({ ok: false, razon: 'invalido', motivo: 'el texto contiene un valor en pesos (R1, R2)' });
    expect(repositorio.casos[0]?.texto).toBe('Original.');
  });

  it('CAS4 — Un caso del sistema se edita y conserva su clave del sistema', async () => {
    const { admin, repositorio, sistema } = crear();
    const caso = repositorio.sembrarCaso({
      categoriaId: sistema.id,
      titulo: 'Espera del asesor',
      disparador: 'evento',
      claveSistema: 'mensaje_espera_handoff',
      actualizado: LEIDO,
    });

    const resultado = await admin.editar(caso.id, { actualizado: LEIDO, texto: 'Te paso con un asesor.' });

    expect(resultado).toMatchObject({ ok: true, caso: { texto: 'Te paso con un asesor.', claveSistema: 'mensaje_espera_handoff', disparador: 'evento' } });
  });

  it('CAS4 — Las claves retiradas ya no son claves del sistema', async () => {
    const { admin, politicas, repositorio } = crear();

    const resultado = await admin.crear({ categoriaId: politicas.id, ...NUEVO, claveSistema: 'mensaje_handoff' });

    expect(resultado).toEqual({ ok: false, razon: 'invalido', motivo: 'los casos del sistema no se crean desde la API (CAS4)' });
    expect(repositorio.casos).toHaveLength(0);
  });

  it('CAS4 — El título de un caso del sistema se edita', async () => {
    const { admin, repositorio, sistema } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: sistema.id, titulo: 'Audio recibido', disparador: 'evento', claveSistema: 'mensaje_pedir_texto_audio', actualizado: LEIDO });

    const resultado = await admin.editar(caso.id, { actualizado: LEIDO, titulo: 'Audios' });

    expect(resultado).toMatchObject({ ok: true, caso: { titulo: 'Audios', claveSistema: 'mensaje_pedir_texto_audio', disparador: 'evento' } });
  });

  it('CAS4 — El título editado no puede repetir el de otro caso', async () => {
    const { admin, repositorio, politicas, sistema } = crear();
    repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Tratamiento de datos' });
    const caso = repositorio.sembrarCaso({ categoriaId: sistema.id, titulo: 'Audio recibido', disparador: 'evento', claveSistema: 'mensaje_pedir_texto_audio', actualizado: LEIDO });

    const resultado = await admin.editar(caso.id, { actualizado: LEIDO, titulo: 'tratamiento de datos' });

    expect(resultado).toEqual({ ok: false, razon: 'duplicado' });
    expect((await admin.obtener(caso.id))?.titulo).toBe('Audio recibido');
  });

  it('CAS4 — Un caso del sistema no se desactiva', async () => {
    const { admin, repositorio, sistema, version } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: sistema.id, titulo: 'Techo de gasto alcanzado', disparador: 'evento', claveSistema: 'mensaje_techo_gasto', actualizado: LEIDO });

    expect(await admin.editar(caso.id, { actualizado: LEIDO, activo: false })).toEqual({ ok: false, razon: 'del-sistema' });
    expect(repositorio.casos[0]?.activo).toBe(true);
    expect(version.incrementos).toBe(0);
  });

  it('CAS5 — Un caso del sistema no admite el modo guía', async () => {
    const { admin, repositorio, sistema } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: sistema.id, titulo: 'Falla técnica', disparador: 'evento', claveSistema: 'mensaje_error_llm', actualizado: LEIDO });

    expect(await admin.editar(caso.id, { actualizado: LEIDO, modo: 'guia' })).toEqual({
      ok: false,
      razon: 'invalido',
      motivo: 'un caso del sistema solo admite el modo literal',
    });
  });

  it('CAS4 — La API no cambia la clave del sistema de un caso', async () => {
    const { admin, repositorio, politicas } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía', actualizado: LEIDO });

    expect(await admin.editar(caso.id, { actualizado: LEIDO, claveSistema: 'mensaje_espera_handoff' })).toEqual({
      ok: false,
      razon: 'invalido',
      motivo: 'la clave del sistema de un caso no se cambia desde la API (CAS4)',
    });
  });

  it('CAS3 — Borrar un caso de intención lo quita del listado', async () => {
    const { admin, repositorio, politicas, version } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía' });

    expect(await admin.borrar(caso.id)).toEqual({ ok: true });
    expect(repositorio.casos).toHaveLength(0);
    expect(version.incrementos).toBe(1);
  });

  it('CAS4 — Un caso del sistema no se borra; uno inexistente responde inexistente', async () => {
    const { admin, repositorio, sistema, version } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: sistema.id, titulo: 'Espera del asesor', disparador: 'evento', claveSistema: 'mensaje_espera_handoff' });

    expect(await admin.borrar(caso.id)).toEqual({ ok: false, razon: 'del-sistema' });
    expect(await admin.borrar('no-existe')).toEqual({ ok: false, razon: 'inexistente' });
    expect(repositorio.casos).toHaveLength(1);
    expect(version.incrementos).toBe(0);
  });

  it('obtener entrega el caso o null', async () => {
    const { admin, repositorio, politicas } = crear();
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía' });

    expect(await admin.obtener(caso.id)).toMatchObject({ titulo: 'Garantía' });
    expect(await admin.obtener('no-existe')).toBeNull();
  });
});

describe('asistente/aplicacion — AdministrarCasos (listar, CAS10)', () => {
  it('CAS10 — La búsqueda llega normalizada al repositorio y un q vacío lista todo', async () => {
    const { admin, repositorio, politicas } = crear();
    repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'garantia' });
    repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'devoluciones' });

    expect((await admin.listar({ q: 'GARANTÍA' })).items.map((c) => c.titulo)).toEqual(['garantia']);
    expect((await admin.listar({ q: '   ' })).items).toHaveLength(2);
    expect((await admin.listar({})).items).toHaveLength(2);
  });

  it('CAS10 — Filtra por categoría, por disparador y por activo', async () => {
    const { admin, repositorio, politicas, sistema } = crear();
    repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'a-intencion' });
    repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'b-inactivo', activo: false });
    repositorio.sembrarCaso({ categoriaId: sistema.id, titulo: 'c-evento', disparador: 'evento', claveSistema: 'mensaje_techo_gasto' });

    expect((await admin.listar({ categoriaId: politicas.id, disparador: 'intencion' })).items.map((c) => c.titulo)).toEqual(['a-intencion', 'b-inactivo']);
    expect((await admin.listar({ activo: false })).items.map((c) => c.titulo)).toEqual(['b-inactivo']);
    expect((await admin.listar({ disparador: 'evento' })).items.map((c) => c.titulo)).toEqual(['c-evento']);
  });

  it('CAS10 — El listado se pagina por cursor: 10, 10 y 5 casos, y la última página trae siguienteCursor nulo', async () => {
    const { admin, repositorio, politicas } = crear();
    for (let i = 1; i <= 25; i += 1) repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: `caso-${String(i).padStart(2, '0')}` });

    const primera = await admin.listar({ limite: 10 });
    const segunda = await admin.listar({ limite: 10, cursor: primera.siguienteCursor ?? '' });
    const tercera = await admin.listar({ limite: 10, cursor: segunda.siguienteCursor ?? '' });

    expect([primera.items.length, segunda.items.length, tercera.items.length]).toEqual([10, 10, 5]);
    expect(primera.siguienteCursor).not.toBeNull();
    expect(tercera.siguienteCursor).toBeNull();
    expect(new Set([...primera.items, ...segunda.items, ...tercera.items].map((c) => c.id)).size).toBe(25);
  });

  it('el límite máximo es 100 y el predeterminado 20', async () => {
    const { admin, repositorio, politicas } = crear();
    for (let i = 1; i <= 120; i += 1) repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: `caso-${String(i).padStart(3, '0')}` });

    expect((await admin.listar({})).items).toHaveLength(20);
    expect((await admin.listar({ limite: 500 })).items).toHaveLength(100);
  });

  it('un cursor que no se puede leer se rechaza', async () => {
    const { admin } = crear();

    await expect(admin.listar({ cursor: 'basura' })).rejects.toMatchObject({ name: 'CursorInvalido' });
    expect(codificarCursor({ ordenCategoria: 0, tituloNormalizado: 'a', id: 'x' })).toBeTruthy();
  });
});
