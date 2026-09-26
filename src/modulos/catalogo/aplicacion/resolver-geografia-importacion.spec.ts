import { describe, expect, it } from 'vitest';
import { RepositorioGeografiaEnMemoria } from '../../../../test/fakes/repositorio-geografia-en-memoria.js';
import { ResolverGeografiaImportacion } from './resolver-geografia-importacion.js';

// T8 (fase-03-importador-medios), D5: carga el catálogo geográfico completo (REPOSITORIO_GEOGRAFIA,
// ya existente de la Fase 01) una sola vez por corrida de importación y lo mapea a los tipos locales
// de `dominio/resolver-lugar.ts`, sin que `catalogo/dominio/` importe nada de `modulos/geografia`.

describe('catalogo/aplicacion/ResolverGeografiaImportacion', () => {
  it('carga el catálogo geográfico completo y lo mapea a los tipos locales de resolver-lugar (D5)', async () => {
    const repositorioGeografia = new RepositorioGeografiaEnMemoria();
    await repositorioGeografia.guardarCatalogo({
      departamentos: [
        { id: '05', nombre: 'Antioquia' },
        { id: '27', nombre: 'Chocó' },
      ],
      ciudades: [
        { id: '05001', departamentoId: '05', nombre: 'Medellín' },
        { id: '27001', departamentoId: '27', nombre: 'Quibdó' },
      ],
    });

    const caso = new ResolverGeografiaImportacion(repositorioGeografia);
    const lugares = await caso.ejecutar();

    expect(lugares).toEqual({
      departamentos: [
        { id: '05', nombre: 'Antioquia' },
        { id: '27', nombre: 'Chocó' },
      ],
      ciudades: [
        { id: '05001', departamentoId: '05', nombre: 'Medellín' },
        { id: '27001', departamentoId: '27', nombre: 'Quibdó' },
      ],
    });
  });

  it('devuelve un catálogo vacío cuando la geografía no tiene ningún departamento guardado', async () => {
    const caso = new ResolverGeografiaImportacion(new RepositorioGeografiaEnMemoria());

    const lugares = await caso.ejecutar();

    expect(lugares).toEqual({ departamentos: [], ciudades: [] });
  });
});
