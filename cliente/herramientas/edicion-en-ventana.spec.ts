import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * SHL8 — Ninguna pantalla edita en la página: todo control de formulario de una pantalla de `areas/`
 * vive dentro de `app-dialogo-edicion` (ventana emergente compartida). Es un test de estructura sobre
 * el código, no un lint: lo que se prueba es que el componente de la pantalla use la ventana.
 */
const areas = path.resolve(import.meta.dirname, '..', 'src', 'app', 'areas');

/** Pantallas que todavía editan en la página y se retiran en T8 (la pantalla «Mensajes fijos»). */
const EXCEPCIONES_HASTA_T8 = ['bot/mensajes-fijos/mensajes-fijos.component.ts'];

const CONTROLES = /<form[\s>]|<textarea[\s>]|<input[\s>]|<select[\s>]|<mat-select[\s>]|<app-editor-con-contador[\s>]/;

/** Si el código declara un control de formulario sin ventana de edición, devuelve true. */
export function editaFueraDeLaVentana(codigo: string): boolean {
  return CONTROLES.test(codigo) && !/<app-dialogo-edicion[\s>]/.test(codigo);
}

function componentes(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = path.join(directorio, nombre);
    if (statSync(ruta).isDirectory()) return componentes(ruta);
    return nombre.endsWith('.component.ts') ? [ruta] : [];
  });
}

describe('SHL8 — Ninguna pantalla edita en la página', () => {
  it('SHL8 — el detector marca un formulario fijo y deja pasar el que usa la ventana', () => {
    expect(editaFueraDeLaVentana('<mat-card><textarea matInput></textarea></mat-card>')).toBe(true);
    expect(editaFueraDeLaVentana('<app-editor-con-contador etiqueta="x" />')).toBe(true);
    expect(
      editaFueraDeLaVentana('<app-dialogo-edicion titulo="x"><app-editor-con-contador etiqueta="x" /></app-dialogo-edicion>'),
    ).toBe(false);
    expect(editaFueraDeLaVentana('<h1>Solo lectura</h1>')).toBe(false);
  });

  it('SHL8 — ninguna pantalla de las áreas declara un formulario de edición fuera de la ventana', () => {
    const infractoras = componentes(areas)
      .map((ruta) => path.relative(areas, ruta).split(path.sep).join('/'))
      .filter((relativa) => !EXCEPCIONES_HASTA_T8.includes(relativa))
      .filter((relativa) => editaFueraDeLaVentana(readFileSync(path.join(areas, relativa), 'utf8')));

    expect(infractoras).toEqual([]);
  });
});
