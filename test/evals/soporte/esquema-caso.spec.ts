import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cargarCasos, parsearCaso, separarPorModoReal } from './esquema-caso.js';

const CASO_VALIDO = {
  id: 'saludo',
  titulo: 'EVL1 — caso: saludo',
  origen: 'sintetico',
  turnos: [
    {
      mensajes: [{ tipoContenido: 'texto', texto: 'hola' }],
      guion: [{ texto: 'Hola, ¿en qué te ayudo?' }],
      aserciones: { handoff: 'prohibido' },
    },
  ],
};

describe('test/evals — esquema de casos (D3)', () => {
  it('acepta un caso sintético con guion y aserciones', () => {
    expect(parsearCaso(CASO_VALIDO, 'saludo.json').id).toBe('saludo');
  });

  it('un caso sintético sin guion se rechaza nombrando el archivo y el turno', () => {
    const sinGuion = { ...CASO_VALIDO, turnos: [{ ...CASO_VALIDO.turnos[0], guion: undefined }] };

    expect(() => parsearCaso(sinGuion, 'saludo.json')).toThrow(/saludo\.json.*turnos\.0\.guion/s);
  });

  it('un caso real-anonimizado exige revisadoPor y fecha', () => {
    const real = { ...CASO_VALIDO, origen: 'real-anonimizado', turnos: [{ ...CASO_VALIDO.turnos[0], guion: undefined }] };

    expect(() => parsearCaso(real, 'real.json')).toThrow(/revisadoPor/);
    expect(parsearCaso({ ...real, revisadoPor: 'davi', fecha: '2026-09-30' }, 'real.json').origen).toBe('real-anonimizado');
  });

  it('un campo inválido nombra el archivo y el campo', () => {
    const malo = { ...CASO_VALIDO, turnos: [{ ...CASO_VALIDO.turnos[0], mensajes: [{ tipoContenido: 'video', texto: 'x' }] }] };

    expect(() => parsearCaso(malo, 'malo.json')).toThrow(/malo\.json.*tipoContenido/s);
  });

  it('cargarCasos lee todos los .json de una carpeta ordenados por id y falla nombrando el archivo inválido', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'casos-'));
    try {
      writeFileSync(path.join(carpeta, 'b.json'), JSON.stringify({ ...CASO_VALIDO, id: 'b' }));
      writeFileSync(path.join(carpeta, 'a.json'), JSON.stringify({ ...CASO_VALIDO, id: 'a' }));
      expect(cargarCasos(carpeta).map((caso) => caso.id)).toEqual(['a', 'b']);

      writeFileSync(path.join(carpeta, 'roto.json'), '{ no es json');
      expect(() => cargarCasos(carpeta)).toThrow(/roto\.json/);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});

describe('test/evals — soloGuionado (casos cuya premisa es un guion)', () => {
  it('acepta soloGuionado en un caso sintético', () => {
    expect(parsearCaso({ ...CASO_VALIDO, soloGuionado: true }, 'g.json').soloGuionado).toBe(true);
  });

  it('rechaza soloGuionado que no sea booleano, nombrando archivo y campo', () => {
    expect(() => parsearCaso({ ...CASO_VALIDO, soloGuionado: 'si' }, 'g.json')).toThrow(/g\.json.*soloGuionado/s);
  });

  it('rechaza soloGuionado en un caso real-anonimizado: no tiene guion que lo justifique', () => {
    const real = {
      ...CASO_VALIDO,
      origen: 'real-anonimizado',
      revisadoPor: 'davi',
      fecha: '2026-09-30',
      soloGuionado: true,
      turnos: [{ ...CASO_VALIDO.turnos[0], guion: undefined }],
    };

    expect(() => parsearCaso(real, 'real.json')).toThrow(/real\.json.*soloGuionado/s);
  });

  it('separarPorModoReal omite los soloGuionado y conserva el orden del resto', () => {
    const a = parsearCaso({ ...CASO_VALIDO, id: 'a' }, 'a.json');
    const b = parsearCaso({ ...CASO_VALIDO, id: 'b', soloGuionado: true }, 'b.json');
    const c = parsearCaso({ ...CASO_VALIDO, id: 'c' }, 'c.json');

    const { ejecutables, omitidos } = separarPorModoReal([a, b, c]);

    expect(ejecutables.map((caso) => caso.id)).toEqual(['a', 'c']);
    expect(omitidos.map((caso) => caso.id)).toEqual(['b']);
  });
});
