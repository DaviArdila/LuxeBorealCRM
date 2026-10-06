import { describe, expect, it } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import type { ClaveSistema } from '../dominio/sistema.js';
import type { CasoDelSistema, RepositorioCasos } from '../puertos/repositorio-casos.js';
import type { VersionAsistente } from '../puertos/version-asistente.js';
import { AdministrarTextosDelSistema } from './administrar-textos-del-sistema.js';

// CAS4/CAS7 (Fase 12, T5): leer, guardar y crear los textos de los casos del sistema, para el adaptador de `mensajes-fijos`.

class RepositorioCasosFalso
  implements Pick<RepositorioCasos, 'leerCasosDelSistema' | 'guardarTextoDelSistema' | 'crearTextoDelSistemaSiFalta'>
{
  casos = new Map<string, CasoDelSistema>();
  guardados: { clave: string; texto: string; ahora: Date }[] = [];
  leerCasosDelSistema(): Promise<ReadonlyMap<string, CasoDelSistema>> {
    return Promise.resolve(this.casos);
  }
  guardarTextoDelSistema(clave: ClaveSistema, texto: string, ahora: Date): Promise<void> {
    this.guardados.push({ clave, texto, ahora });
    this.casos.set(clave, { texto, actualizado: ahora });
    return Promise.resolve();
  }
  crearTextoDelSistemaSiFalta(clave: ClaveSistema, texto: string, ahora: Date): Promise<boolean> {
    if (this.casos.has(clave)) return Promise.resolve(false);
    this.casos.set(clave, { texto, actualizado: ahora });
    return Promise.resolve(true);
  }
}

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

function crear() {
  const repositorio = new RepositorioCasosFalso();
  const version = new VersionFalsa();
  const clock = new ClockFalso(new Date('2026-10-06T12:00:00Z'));
  return { admin: new AdministrarTextosDelSistema(repositorio, version, clock), repositorio, version, clock };
}

describe('asistente/aplicacion — AdministrarTextosDelSistema', () => {
  it('leer entrega el texto y la fecha de cada caso del sistema que existe', async () => {
    const { admin, repositorio, clock } = crear();
    repositorio.casos.set('mensaje_handoff', { texto: 'Traspaso', actualizado: clock.ahora() });

    const casos = await admin.leer();

    expect([...casos.keys()]).toEqual(['mensaje_handoff']);
    expect(casos.get('mensaje_handoff')).toEqual({ texto: 'Traspaso', actualizado: clock.ahora() });
  });

  it('CAS4 — guardar escribe el texto con la hora del reloj y sube la versión compartida', async () => {
    const { admin, repositorio, version, clock } = crear();

    await admin.guardar('mensaje_handoff', 'Texto nuevo');

    expect(repositorio.guardados).toEqual([{ clave: 'mensaje_handoff', texto: 'Texto nuevo', ahora: clock.ahora() }]);
    expect(version.incrementos).toBe(1);
  });

  it('CAS7 — si Redis falla tras guardar, el texto queda guardado y la operación termina', async () => {
    const { admin, repositorio, version } = crear();
    version.falla = true;

    await expect(admin.guardar('aviso_datos', 'Aviso nuevo')).resolves.toBeUndefined();

    expect(repositorio.guardados).toHaveLength(1);
  });

  it('crearFaltantes crea solo los casos que no existen, no pisa los existentes y sube la versión si creó alguno', async () => {
    const { admin, repositorio, version, clock } = crear();
    repositorio.casos.set('mensaje_handoff', { texto: 'Del dueño', actualizado: clock.ahora() });

    const creados = await admin.crearFaltantes([
      { clave: 'mensaje_handoff', texto: 'Respaldo uno' },
      { clave: 'aviso_datos', texto: 'Respaldo dos' },
    ]);

    expect(creados).toBe(1);
    expect(repositorio.casos.get('mensaje_handoff')?.texto).toBe('Del dueño');
    expect(repositorio.casos.get('aviso_datos')?.texto).toBe('Respaldo dos');
    expect(version.incrementos).toBe(1);
  });

  it('crearFaltantes sin nada que crear no sube la versión', async () => {
    const { admin, repositorio, version, clock } = crear();
    repositorio.casos.set('aviso_datos', { texto: 'X', actualizado: clock.ahora() });

    expect(await admin.crearFaltantes([{ clave: 'aviso_datos', texto: 'Y' }])).toBe(0);
    expect(version.incrementos).toBe(0);
  });
});
