import { describe, expect, it } from 'vitest';
import type { DefinicionMensajeFijo } from '../../../compartido/mensajes-fijos/index.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { RepositorioMensajesFijosEnMemoria } from '../../../../test/fakes/repositorio-mensajes-fijos-en-memoria.js';
import { GuardarMensajeFijo } from './guardar-mensaje-fijo.js';
import { ListarMensajesFijos } from './listar-mensajes-fijos.js';
import { SembrarMensajesFijos } from './sembrar-mensajes-fijos.js';

// CFN1-CFN3 con dobles: el repositorio real se prueba contra Postgres.

const CATALOGO: readonly DefinicionMensajeFijo[] = [
  { clave: 'mensaje_handoff', descripcion: 'Cuando pasa a un asesor.', textoRespaldo: 'Te paso con un asesor.' },
  { clave: 'mensaje_fuera_cobertura', descripcion: 'Sin cobertura de envío.', textoRespaldo: 'No llegamos a tu ciudad.' },
  { clave: 'mensaje_techo_gasto', descripcion: 'Techo de gasto.', textoRespaldo: 'Te atiende un asesor.' },
];
const AHORA = new Date('2026-10-04T15:00:00.000Z');

function crear() {
  const repositorio = new RepositorioMensajesFijosEnMemoria();
  const clock = new ClockFalso(AHORA);
  return {
    repositorio,
    clock,
    listar: new ListarMensajesFijos(CATALOGO, repositorio),
    guardar: new GuardarMensajeFijo(CATALOGO, repositorio, clock),
    sembrar: new SembrarMensajesFijos(CATALOGO, repositorio, clock),
  };
}

describe('ListarMensajesFijos (CFN1)', () => {
  it('CFN1 — La lista trae todos los mensajes con su origen', async () => {
    const { listar, repositorio } = crear();
    repositorio.filas.set('mensaje_handoff', { valor: 'Ya te comunico.', actualizado: new Date('2026-10-02T10:00:00.000Z') });

    const mensajes = await listar.ejecutar();

    expect(mensajes).toEqual([
      { clave: 'mensaje_handoff', descripcion: 'Cuando pasa a un asesor.', texto: 'Ya te comunico.', origen: 'base', actualizado: '2026-10-02T10:00:00.000Z' },
      { clave: 'mensaje_fuera_cobertura', descripcion: 'Sin cobertura de envío.', texto: 'No llegamos a tu ciudad.', origen: 'respaldo', actualizado: null },
      { clave: 'mensaje_techo_gasto', descripcion: 'Techo de gasto.', texto: 'Te atiende un asesor.', origen: 'respaldo', actualizado: null },
    ]);
  });

  it('CFN1 — Una clave fuera de la lista no aparece', async () => {
    const { listar, repositorio } = crear();
    repositorio.filas.set('llm_techo_mensual_usd', { valor: 10, actualizado: AHORA });

    const mensajes = await listar.ejecutar();

    expect(mensajes.map((m) => m.clave)).not.toContain('llm_techo_mensual_usd');
    expect(mensajes).toHaveLength(3);
  });

  it('un valor que no es texto o está en blanco cuenta como respaldo, igual que lo lee el bot', async () => {
    const { listar, repositorio } = crear();
    repositorio.filas.set('mensaje_handoff', { valor: '   ', actualizado: AHORA });
    repositorio.filas.set('mensaje_fuera_cobertura', { valor: 42, actualizado: AHORA });

    const mensajes = await listar.ejecutar();

    expect(mensajes.map((m) => [m.origen, m.actualizado])).toEqual([['respaldo', null], ['respaldo', null], ['respaldo', null]]);
    expect(mensajes[0]?.texto).toBe('Te paso con un asesor.');
  });
});

describe('GuardarMensajeFijo (CFN2)', () => {
  it('CFN2 — guarda el texto, actualiza la fecha con el reloj y devuelve el mensaje con origen base', async () => {
    const { guardar, repositorio } = crear();

    const resultado = await guardar.ejecutar('mensaje_handoff', 'Ya te comunico con un asesor.');

    expect(resultado).toEqual({
      guardado: true,
      mensaje: {
        clave: 'mensaje_handoff',
        descripcion: 'Cuando pasa a un asesor.',
        texto: 'Ya te comunico con un asesor.',
        origen: 'base',
        actualizado: '2026-10-04T15:00:00.000Z',
      },
    });
    expect(repositorio.filas.get('mensaje_handoff')).toEqual({ valor: 'Ya te comunico con un asesor.', actualizado: AHORA });
  });

  it('quita los espacios y saltos de línea de los bordes antes de validar y guardar', async () => {
    const { guardar, repositorio } = crear();

    await guardar.ejecutar('mensaje_handoff', '  Ya te comunico.\n');

    expect(repositorio.filas.get('mensaje_handoff')?.valor).toBe('Ya te comunico.');
  });

  it.each([
    ['en blanco', '   ', /vac/],
    ['de 1.001 caracteres', 'a'.repeat(1001), /1000/],
    ['con un valor en pesos', 'Te sale en $ 120.000', /pesos/],
    ['con un marcador de plantilla', 'Hola {{nombre}}', /plantilla/],
  ])('CFN2 — Un texto %s se rechaza con su motivo y no cambia lo vigente', async (_caso, texto, motivo) => {
    const { guardar, repositorio } = crear();
    repositorio.filas.set('mensaje_handoff', { valor: 'Texto vigente.', actualizado: AHORA });

    const resultado = await guardar.ejecutar('mensaje_handoff', texto);

    expect(resultado).toMatchObject({ guardado: false, razon: 'invalido', motivo: expect.stringMatching(motivo) as unknown });
    expect(repositorio.filas.get('mensaje_handoff')?.valor).toBe('Texto vigente.');
    expect(repositorio.escrituras).toEqual([]);
  });

  it('CFN2 — Una clave desconocida no se escribe', async () => {
    const { guardar, repositorio } = crear();

    const resultado = await guardar.ejecutar('llm_techo_mensual_usd', 'Un texto cualquiera');

    expect(resultado).toEqual({ guardado: false, razon: 'desconocida' });
    expect(repositorio.filas.size).toBe(0);
    expect(repositorio.escrituras).toEqual([]);
  });
});

describe('SembrarMensajesFijos (CFN3)', () => {
  it('CFN3 — La semilla llena una base vacía con los textos de respaldo', async () => {
    const { sembrar, repositorio } = crear();

    const resultado = await sembrar.ejecutar();

    expect(resultado).toEqual({ insertadas: 3, existentes: 0 });
    expect([...repositorio.filas].map(([clave, fila]) => [clave, fila.valor])).toEqual([
      ['mensaje_handoff', 'Te paso con un asesor.'],
      ['mensaje_fuera_cobertura', 'No llegamos a tu ciudad.'],
      ['mensaje_techo_gasto', 'Te atiende un asesor.'],
    ]);
  });

  it('CFN3 — La semilla no pisa un texto editado', async () => {
    const { sembrar, repositorio } = crear();
    const editada = new Date('2026-10-01T09:00:00.000Z');
    repositorio.filas.set('mensaje_handoff', { valor: 'Texto del dueño.', actualizado: editada });

    const resultado = await sembrar.ejecutar();

    expect(resultado).toEqual({ insertadas: 2, existentes: 1 });
    expect(repositorio.filas.get('mensaje_handoff')).toEqual({ valor: 'Texto del dueño.', actualizado: editada });
  });

  it('CFN3 — Correr la semilla dos veces no cambia nada', async () => {
    const { sembrar, repositorio, clock } = crear();
    await sembrar.ejecutar();
    const despuesDeLaPrimera = new Map(repositorio.filas);
    clock.avanzar(60 * 60 * 1000);

    const segunda = await sembrar.ejecutar();

    expect(segunda).toEqual({ insertadas: 0, existentes: 3 });
    expect(repositorio.filas).toEqual(despuesDeLaPrimera);
  });
});
