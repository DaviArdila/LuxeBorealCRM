import { describe, expect, it } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { RepositorioAdministracionEnMemoria } from '../../../../test/fakes/repositorio-administracion-en-memoria.js';
import type { PerfilUsuario } from '../../usuarios/index.js';
import { AdministrarCasos } from '../aplicacion/administrar-casos.js';
import { AdministrarCategorias } from '../aplicacion/administrar-categorias.js';
import type { VersionAsistente } from '../puertos/version-asistente.js';
import { AsistenteController } from './asistente.controller.js';

// CAS9 (Fase 12, T7): el controlador solo traduce los resultados de los casos de uso a respuestas HTTP y errores de catálogo.

const admin: PerfilUsuario = { id: '0199a000-0000-7000-8000-000000000001', nombre: 'Dueño', email: 'a@b.co', rol: 'admin' };
const VERSION: VersionAsistente = { obtener: () => Promise.resolve('0'), incrementar: () => Promise.resolve() };

function crear() {
  const repositorio = new RepositorioAdministracionEnMemoria();
  const clock = new ClockFalso(new Date('2026-10-06T12:00:00Z'));
  const controlador = new AsistenteController(new AdministrarCategorias(repositorio, VERSION, clock), new AdministrarCasos(repositorio, VERSION, clock));
  return { controlador, repositorio, clock };
}

const NUEVO = { titulo: 'Medios de pago', cuandoAplica: 'Cuando preguntan cómo pagar.', texto: 'Aceptamos transferencia bancaria.' };

describe('AsistenteController — categorías (CAS9)', () => {
  it('listarCategoriasCaso entrega las categorías en orden con su cantidad de casos', async () => {
    const { controlador, repositorio } = crear();
    const politicas = repositorio.sembrarCategoria('Políticas');
    repositorio.sembrarCategoria('Pagos');
    repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía' });

    const { categorias } = await controlador.listarCategoriasCaso();

    expect(categorias.map((c) => [c.nombre, c.orden, c.totalCasos])).toEqual([['Políticas', 0, 1], ['Pagos', 1, 0]]);
  });

  it('crearCategoriaCaso entrega la categoría creada; un nombre repetido responde categoria-duplicada', async () => {
    const { controlador } = crear();

    await expect(controlador.crearCategoriaCaso({ nombre: 'Pagos' }, admin)).resolves.toMatchObject({ nombre: 'Pagos', totalCasos: 0 });
    await expect(controlador.crearCategoriaCaso({ nombre: 'pagos' }, admin)).rejects.toMatchObject({ codigo: 'categoria-duplicada' });
  });

  it('un nombre en blanco responde categoria-invalida con el motivo', async () => {
    const { controlador } = crear();

    await expect(controlador.crearCategoriaCaso({ nombre: '   ' }, admin)).rejects.toMatchObject({
      codigo: 'categoria-invalida',
      detalle: 'el nombre de la categoría está vacío',
    });
  });

  it('renombrarCategoriaCaso responde 404 si no existe y categoria-duplicada si el nombre ya está', async () => {
    const { controlador, repositorio } = crear();
    repositorio.sembrarCategoria('Pagos');
    const envios = repositorio.sembrarCategoria('Envíos');

    await expect(controlador.renombrarCategoriaCaso(envios.id, { nombre: 'Medios de pago' }, admin)).resolves.toMatchObject({ nombre: 'Medios de pago' });
    await expect(controlador.renombrarCategoriaCaso('no-existe', { nombre: 'X' }, admin)).rejects.toMatchObject({ codigo: 'categoria-inexistente' });
    await expect(controlador.renombrarCategoriaCaso(envios.id, { nombre: 'pagos' }, admin)).rejects.toMatchObject({ codigo: 'categoria-duplicada' });
  });

  it('ordenarCategoriasCaso reordena y, si la lista no coincide, responde orden-categorias-invalido', async () => {
    const { controlador, repositorio } = crear();
    const a = repositorio.sembrarCategoria('A');
    const b = repositorio.sembrarCategoria('B');
    const c = repositorio.sembrarCategoria('C');

    const { categorias } = await controlador.ordenarCategoriasCaso({ ids: [c.id, a.id, b.id] }, admin);

    expect(categorias.map((x) => x.nombre)).toEqual(['C', 'A', 'B']);
    await expect(controlador.ordenarCategoriasCaso({ ids: [a.id, b.id] }, admin)).rejects.toMatchObject({ codigo: 'orden-categorias-invalido' });
  });

  it('borrarCategoriaCaso responde categoria-con-casos si tiene casos y 404 si no existe', async () => {
    const { controlador, repositorio } = crear();
    const llena = repositorio.sembrarCategoria('Llena');
    const vacia = repositorio.sembrarCategoria('Vacía');
    repositorio.sembrarCaso({ categoriaId: llena.id, titulo: 'Garantía' });

    await expect(controlador.borrarCategoriaCaso(llena.id, admin)).rejects.toMatchObject({ codigo: 'categoria-con-casos' });
    await expect(controlador.borrarCategoriaCaso('no-existe', admin)).rejects.toMatchObject({ codigo: 'categoria-inexistente' });
    await expect(controlador.borrarCategoriaCaso(vacia.id, admin)).resolves.toBeUndefined();
  });
});

describe('AsistenteController — casos (CAS9)', () => {
  it('crearCaso entrega el caso con fechas ISO; título repetido, categoría inexistente y texto inválido responden su código', async () => {
    const { controlador, repositorio } = crear();
    const politicas = repositorio.sembrarCategoria('Políticas');

    const creado = await controlador.crearCaso({ categoriaId: politicas.id, ...NUEVO }, admin);

    expect(creado).toMatchObject({ titulo: 'Medios de pago', activo: true, modo: 'literal', disparador: 'intencion', claveSistema: null, categoriaNombre: 'Políticas' });
    expect(creado.actualizado).toBe('2026-10-06T12:00:00.000Z');
    await expect(controlador.crearCaso({ categoriaId: politicas.id, ...NUEVO }, admin)).rejects.toMatchObject({ codigo: 'caso-duplicado' });
    await expect(controlador.crearCaso({ categoriaId: 'no-existe', ...NUEVO, titulo: 'Otro' }, admin)).rejects.toMatchObject({ codigo: 'categoria-inexistente' });
    await expect(controlador.crearCaso({ categoriaId: politicas.id, ...NUEVO, titulo: 'Caro', texto: 'Vale $ 5.000' }, admin)).rejects.toMatchObject({
      codigo: 'caso-invalido',
      detalle: 'el texto contiene un valor en pesos (R1, R2)',
    });
  });

  it('crearCaso sin «cuándo aplica» responde caso-invalido', async () => {
    const { controlador, repositorio } = crear();
    const politicas = repositorio.sembrarCategoria('Políticas');

    await expect(controlador.crearCaso({ categoriaId: politicas.id, titulo: 'Garantía', texto: 'Cubre ocho días.' }, admin)).rejects.toMatchObject({
      codigo: 'caso-invalido',
    });
  });

  it('obtenerCaso entrega el caso y un identificador que no existe responde caso-inexistente', async () => {
    const { controlador, repositorio } = crear();
    const politicas = repositorio.sembrarCategoria('Políticas');
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía' });

    await expect(controlador.obtenerCaso(caso.id)).resolves.toMatchObject({ titulo: 'Garantía' });
    await expect(controlador.obtenerCaso('no-existe')).rejects.toMatchObject({ codigo: 'caso-inexistente' });
  });

  it('editarCaso guarda con la fecha leída; una fecha vieja responde caso-modificado', async () => {
    const { controlador, repositorio } = crear();
    const politicas = repositorio.sembrarCategoria('Políticas');
    const caso = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía', actualizado: new Date('2026-10-06T10:00:00Z') });

    const editado = await controlador.editarCaso(caso.id, { actualizado: '2026-10-06T10:00:00.000Z', texto: 'Cubre ocho días.' }, admin);

    expect(editado).toMatchObject({ texto: 'Cubre ocho días.', actualizado: '2026-10-06T12:00:00.000Z' });
    await expect(controlador.editarCaso(caso.id, { actualizado: '2026-10-06T10:00:00.000Z', texto: 'Tarde.' }, admin)).rejects.toMatchObject({
      codigo: 'caso-modificado',
    });
    await expect(controlador.editarCaso('no-existe', { actualizado: '2026-10-06T10:00:00.000Z' }, admin)).rejects.toMatchObject({ codigo: 'caso-inexistente' });
  });

  it('editarCaso responde caso-del-sistema al desactivar y caso-invalido al cambiar la clave', async () => {
    const { controlador, repositorio } = crear();
    const sistema = repositorio.sembrarCategoria('Sistema');
    const caso = repositorio.sembrarCaso({
      categoriaId: sistema.id,
      titulo: 'Aviso de datos',
      disparador: 'evento',
      claveSistema: 'mensaje_techo_gasto',
      actualizado: new Date('2026-10-06T10:00:00Z'),
    });

    await expect(controlador.editarCaso(caso.id, { actualizado: '2026-10-06T10:00:00.000Z', activo: false }, admin)).rejects.toMatchObject({
      codigo: 'caso-del-sistema',
    });
    await expect(controlador.editarCaso(caso.id, { actualizado: '2026-10-06T10:00:00.000Z', claveSistema: 'otra' }, admin)).rejects.toMatchObject({
      codigo: 'caso-invalido',
    });
  });

  it('borrarCaso borra un caso de intención y responde caso-del-sistema o caso-inexistente en los demás casos', async () => {
    const { controlador, repositorio } = crear();
    const politicas = repositorio.sembrarCategoria('Políticas');
    const libre = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Garantía' });
    const sistema = repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: 'Traspaso', disparador: 'evento', claveSistema: 'mensaje_espera_handoff' });

    await expect(controlador.borrarCaso(libre.id, admin)).resolves.toBeUndefined();
    await expect(controlador.borrarCaso(sistema.id, admin)).rejects.toMatchObject({ codigo: 'caso-del-sistema' });
    await expect(controlador.borrarCaso('no-existe', admin)).rejects.toMatchObject({ codigo: 'caso-inexistente' });
  });

  it('listarCasos entrega la página con items y siguienteCursor, y un cursor ilegible responde cursor-invalido', async () => {
    const { controlador, repositorio } = crear();
    const politicas = repositorio.sembrarCategoria('Políticas');
    for (let i = 1; i <= 3; i += 1) repositorio.sembrarCaso({ categoriaId: politicas.id, titulo: `caso-${String(i)}` });

    const pagina = await controlador.listarCasos({ limite: 2 });

    expect(pagina.items.map((c) => c.titulo)).toEqual(['caso-1', 'caso-2']);
    expect(pagina.siguienteCursor).not.toBeNull();
    expect(typeof pagina.items[0]?.creado).toBe('string');
    await expect(controlador.listarCasos({ cursor: 'basura' })).rejects.toMatchObject({ codigo: 'cursor-invalido' });
  });
});
