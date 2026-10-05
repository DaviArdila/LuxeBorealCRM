import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { anonimizarConversacion, parsearArgumentos } from './anonimizar.js';

// Comando `npm run evals:anonimizar` (D8): argumentos, escritura solo si la verificación pasa.

let carpeta = '';

beforeEach(() => {
  carpeta = mkdtempSync(path.join(tmpdir(), 'anonimizar-'));
});
afterEach(() => {
  rmSync(carpeta, { recursive: true, force: true });
});

const CONVERSACION = {
  meta: { contact: { name: 'Laura Gómez' } },
  payload: [{ id: 1, message_type: 0, content: 'Hola, soy Laura, mi correo es laura@correo.com' }],
};

describe('scripts/evals — parsearArgumentos', () => {
  it('lee entrada, salida, nombres e id', () => {
    expect(parsearArgumentos(['--entrada', 'a.json', '--salida', 'b.json', '--nombres', 'Ana Ruiz,Luis', '--id', 'c1'])).toEqual({
      entrada: 'a.json',
      salida: 'b.json',
      nombres: ['Ana Ruiz', 'Luis'],
      id: 'c1',
    });
  });

  it('exige entrada y salida', () => {
    expect(() => parsearArgumentos(['--entrada', 'a.json'])).toThrow(/--salida/);
    expect(() => parsearArgumentos(['--salida', 'b.json'])).toThrow(/--entrada/);
  });
});

describe('scripts/evals — anonimizarConversacion', () => {
  it('escribe el caso anonimizado y sin fecha ni revisor, para que una persona lo complete', async () => {
    const entrada = path.join(carpeta, 'crudo.json');
    const salida = path.join(carpeta, 'caso.json');
    writeFileSync(entrada, JSON.stringify(CONVERSACION));

    const resultado = await anonimizarConversacion(['--entrada', entrada, '--salida', salida]);

    expect(resultado.limpio).toBe(true);
    const caso = JSON.parse(readFileSync(salida, 'utf8')) as { revisadoPor: string; turnos: { mensajes: { texto: string }[] }[] };
    expect(caso.revisadoPor).toBe('');
    expect(caso.turnos[0]?.mensajes[0]?.texto).toBe('Hola, soy <NOMBRE_1>, mi correo es <CORREO_1>');
  });

  it('EVL5 — si queda un dato personal no escribe ningún archivo', async () => {
    const entrada = path.join(carpeta, 'crudo.json');
    const salida = path.join(carpeta, 'caso.json');
    writeFileSync(entrada, JSON.stringify({ payload: [{ id: 1, message_type: 0, content: 'llámame 3 0 0 1 2 3 4 5 6 7' }] }));

    const resultado = await anonimizarConversacion(['--entrada', entrada, '--salida', salida]);

    expect(resultado.limpio).toBe(false);
    expect(existsSync(salida)).toBe(false);
    expect(resultado.mensaje).not.toContain('3 0 0 1');
  });

  it('no pisa un caso ya existente (puede estar revisado)', async () => {
    const entrada = path.join(carpeta, 'crudo.json');
    const salida = path.join(carpeta, 'caso.json');
    writeFileSync(entrada, JSON.stringify(CONVERSACION));
    writeFileSync(salida, 'revisado a mano');

    const resultado = await anonimizarConversacion(['--entrada', entrada, '--salida', salida]);

    expect(resultado.limpio).toBe(false);
    expect(readFileSync(salida, 'utf8')).toBe('revisado a mano');
  });

  it('una entrada que no existe o no es JSON falla con un mensaje claro', async () => {
    const resultado = await anonimizarConversacion(['--entrada', path.join(carpeta, 'no-existe.json'), '--salida', path.join(carpeta, 'x.json')]);

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toMatch(/no se pudo leer/i);
  });
});
