import { describe, expect, it } from 'vitest';
import {
  ArgumentosEstiloInvalidos,
  ejecutarEstilo,
  parsearArgumentosEstilo,
  type DependenciasEstilo,
} from './prompt-estilo.js';

// AGT22 (Fase 08c): parseo de argumentos y reporte del comando con dobles; el contexto real se prueba en integración.

function dependencias(sobrescribir: Partial<DependenciasEstilo> = {}): DependenciasEstilo {
  return {
    proveedor: { obtener: () => Promise.resolve({ texto: 'Texto del estilo vigente', version: 3, origen: 'base' as const }) },
    listar: {
      ejecutar: () =>
        Promise.resolve({
          vigente: { texto: 'Texto del estilo vigente', version: 3 },
          historial: [{ version: 2, texto: 'Texto privado viejo', fecha: '2026-09-30T10:00:00.000Z' }],
        }),
    },
    publicar: { ejecutar: () => Promise.resolve({ publicado: true as const, version: 4 }) },
    restaurar: { ejecutar: () => Promise.resolve({ publicado: true as const, version: 5 }) },
    leerArchivo: () => Promise.resolve('Estilo desde archivo'),
    ...sobrescribir,
  };
}

describe('scripts/prompt-estilo — parseo de argumentos (AGT22)', () => {
  it('reconoce ver, historial, publicar --archivo y restaurar --version', () => {
    expect(parsearArgumentosEstilo(['ver'])).toEqual({ accion: 'ver' });
    expect(parsearArgumentosEstilo(['historial'])).toEqual({ accion: 'historial' });
    expect(parsearArgumentosEstilo(['publicar', '--archivo', 'mi-estilo.md'])).toEqual({ accion: 'publicar', archivo: 'mi-estilo.md' });
    expect(parsearArgumentosEstilo(['restaurar', '--version', '2'])).toEqual({ accion: 'restaurar', version: 2 });
  });

  it('rechaza una acción ausente o desconocida, publicar sin archivo y restaurar sin una versión entera', () => {
    expect(() => parsearArgumentosEstilo([])).toThrow(ArgumentosEstiloInvalidos);
    expect(() => parsearArgumentosEstilo(['borrar'])).toThrow(/ver.*historial.*publicar.*restaurar/s);
    expect(() => parsearArgumentosEstilo(['publicar'])).toThrow(/--archivo/);
    expect(() => parsearArgumentosEstilo(['restaurar'])).toThrow(/--version/);
    expect(() => parsearArgumentosEstilo(['restaurar', '--version', 'dos'])).toThrow(/--version/);
    expect(() => parsearArgumentosEstilo(['restaurar', '--version', '0'])).toThrow(/--version/);
  });
});

describe('scripts/prompt-estilo — reporte (AGT22)', () => {
  it('ver muestra la versión, el origen y el texto que usaría el bot', async () => {
    const resultado = await ejecutarEstilo(['ver'], dependencias());

    expect(resultado.limpio).toBe(true);
    expect(resultado.mensaje).toContain('versión 3');
    expect(resultado.mensaje).toContain('base');
    expect(resultado.mensaje).toContain('Texto del estilo vigente');
  });

  it('historial lista versiones y fechas sin copiar los textos', async () => {
    const resultado = await ejecutarEstilo(['historial'], dependencias());

    expect(resultado.mensaje).toContain('2');
    expect(resultado.mensaje).toContain('2026-09-30');
    expect(resultado.mensaje).not.toContain('privado');
    expect(resultado.mensaje).not.toContain('Texto del estilo vigente');
  });

  it('publicar informa la versión y recuerda la corrida real de evals (EVL3), sin copiar el texto', async () => {
    const resultado = await ejecutarEstilo(['publicar', '--archivo', 'x.md'], dependencias());

    expect(resultado.limpio).toBe(true);
    expect(resultado.mensaje).toContain('versión 4');
    expect(resultado.mensaje).toMatch(/EVALS_MODO=real/);
    expect(resultado.mensaje).not.toContain('Estilo desde archivo');
  });

  it('AGT22 — Un estilo inválido no se publica: el comando falla con el motivo', async () => {
    const resultado = await ejecutarEstilo(
      ['publicar', '--archivo', 'x.md'],
      dependencias({ publicar: { ejecutar: () => Promise.resolve({ publicado: false as const, motivo: 'el estilo contiene un valor en pesos (R1, R2)' }) } }),
    );

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('pesos');
    expect(resultado.mensaje).not.toContain('Estilo desde archivo');
  });

  it('un archivo que no se puede leer falla con un mensaje claro y sin publicar', async () => {
    let publicado = false;
    const resultado = await ejecutarEstilo(
      ['publicar', '--archivo', 'no-existe.md'],
      dependencias({
        leerArchivo: () => Promise.reject(new Error('ENOENT')),
        publicar: { ejecutar: () => { publicado = true; return Promise.resolve({ publicado: true as const, version: 1 }); } },
      }),
    );

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('no-existe.md');
    expect(publicado).toBe(false);
  });

  it('restaurar informa la versión nueva o el motivo del rechazo', async () => {
    const bien = await ejecutarEstilo(['restaurar', '--version', '1'], dependencias());
    const mal = await ejecutarEstilo(
      ['restaurar', '--version', '9'],
      dependencias({ restaurar: { ejecutar: () => Promise.resolve({ publicado: false as const, motivo: 'la versión 9 no está en el historial' }) } }),
    );

    expect(bien).toMatchObject({ limpio: true, mensaje: expect.stringContaining('versión 5') as unknown });
    expect(mal).toMatchObject({ limpio: false, mensaje: expect.stringContaining('9') as unknown });
  });

  it('argumentos inválidos devuelven un resultado no limpio con la ayuda', async () => {
    const resultado = await ejecutarEstilo(['publicar'], dependencias());

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('--archivo');
  });
});
