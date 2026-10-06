import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CAS7 (Fase 12): ningún módulo lee de `parametro` un texto que el bot le dice al cliente. Los textos son casos de
 * `asistente` y se piden por su puerto; `parametro` guarda solo parámetros del negocio. Test estático sobre el código de
 * producción: una clave `mensaje_*`, `aviso_*` o `politica_*` junto a un acceso a `parametro` falla nombrando el archivo.
 */
const MODULOS = path.resolve(import.meta.dirname, '..', '..', 'src', 'modulos');
const REVISADOS = ['agente', 'conversaciones', 'catalogo', 'llm', 'configuracion'];

/** Acceso a la tabla `parametro` por Prisma (`prisma.parametro.…`, `tx.parametro.…`) o por SQL (`FROM parametro`). */
const ACCESO_A_PARAMETRO = /\.parametro\b|\bFROM\s+parametro\b|\bINTO\s+parametro\b/i;
const CLAVE_DE_TEXTO = /['"`](?:mensaje_|aviso_|politica_)[a-z0-9_]*/;

/** `true` si el código lee de `parametro` una clave de texto del bot. */
export function leeTextoDeParametro(codigo: string): boolean {
  return ACCESO_A_PARAMETRO.test(codigo) && CLAVE_DE_TEXTO.test(codigo);
}

function fuentes(directorio: string): string[] {
  if (!existsSync(directorio)) return [];
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = path.join(directorio, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts') ? [ruta] : [];
  });
}

describe('CAS7 — Ningún otro módulo lee un texto desde parametro', () => {
  it('CAS7 — el detector marca una lectura de una clave de texto y deja pasar un parámetro del negocio', () => {
    expect(leeTextoDeParametro("await this.prisma.parametro.findUnique({ where: { clave: 'mensaje_handoff' } });")).toBe(true);
    expect(leeTextoDeParametro("tx.parametro.findMany({ where: { clave: { startsWith: 'politica_' } } })")).toBe(true);
    expect(leeTextoDeParametro("await this.prisma.parametro.findUnique({ where: { clave: 'factor_volumetrico' } });")).toBe(false);
    expect(leeTextoDeParametro("const CLAVE = 'mensaje_handoff';")).toBe(false);
  });

  it('CAS7 — agente, conversaciones, catalogo, llm y configuracion no leen de parametro claves mensaje_*, aviso_* ni politica_*', () => {
    const infractores = REVISADOS.flatMap((modulo) => fuentes(path.join(MODULOS, modulo)))
      .filter((archivo) => leeTextoDeParametro(readFileSync(archivo, 'utf8')))
      .map((archivo) => path.relative(MODULOS, archivo).split(path.sep).join('/'));

    expect(infractores).toEqual([]);
  });
});

/** Nombres del sistema retirado en la Fase 12: ninguno debe sobrevivir en el código de producción (CFG6). */
const SISTEMA_VIEJO = /mensajes-fijos|consultar_politica|TEXTOS_FIJOS|mensajes:sembrar|MensajesFijos/;
const RAIZ = path.resolve(import.meta.dirname, '..', '..');

describe('CFG6 — El código de producción no conserva restos del sistema viejo', () => {
  it('CFG6 — el detector marca los nombres retirados', () => {
    expect(SISTEMA_VIEJO.test("import x from '../mensajes-fijos/index.js'")).toBe(true);
    expect(SISTEMA_VIEJO.test('consultar_politica')).toBe(true);
    expect(SISTEMA_VIEJO.test('consultar_caso')).toBe(false);
  });

  it('CFG6 — src y scripts no mencionan mensajes-fijos, consultar_politica, TEXTOS_FIJOS ni mensajes:sembrar', () => {
    const infractores = [path.join(RAIZ, 'src'), path.join(RAIZ, 'scripts')]
      .flatMap((carpeta) => fuentes(carpeta))
      .filter((archivo) => SISTEMA_VIEJO.test(readFileSync(archivo, 'utf8')))
      .map((archivo) => path.relative(RAIZ, archivo).split(path.sep).join('/'));

    expect(infractores).toEqual([]);
  });
});
