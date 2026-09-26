import type {
  CatalogoGeografico,
  Ciudad,
  ConteoGuardado,
  Departamento,
  RepositorioGeografia,
  ResumenGuardado,
} from '../../src/modulos/geografia/index.js';

/**
 * Doble de prueba de {@link RepositorioGeografia} (T4). Reproduce en memoria el mismo contrato de
 * `guardarCatalogo` (upsert por id, nunca borra) que el adaptador Prisma real, para probar
 * `SembrarGeografia` sin Postgres.
 */
export class RepositorioGeografiaEnMemoria implements RepositorioGeografia {
  private readonly departamentos = new Map<string, Departamento>();
  private readonly ciudades = new Map<string, Ciudad>();

  guardarCatalogo(catalogo: CatalogoGeografico): Promise<ResumenGuardado> {
    return Promise.resolve({
      departamentos: aplicarUpsert(this.departamentos, catalogo.departamentos),
      ciudades: aplicarUpsert(this.ciudades, catalogo.ciudades),
    });
  }

  listarDepartamentos(): Promise<readonly Departamento[]> {
    return Promise.resolve(ordenarPorId([...this.departamentos.values()]));
  }

  listarCiudadesDe(departamentoId: string): Promise<readonly Ciudad[]> {
    return Promise.resolve(
      ordenarPorId(
        [...this.ciudades.values()].filter((ciudad) => ciudad.departamentoId === departamentoId),
      ),
    );
  }
}

function aplicarUpsert<T extends { readonly id: string }>(
  mapa: Map<string, T>,
  filas: readonly T[],
): ConteoGuardado {
  let insertados = 0;
  let actualizados = 0;
  let sinCambios = 0;

  for (const fila of filas) {
    const existente = mapa.get(fila.id);
    if (existente === undefined) {
      mapa.set(fila.id, fila);
      insertados++;
    } else if (JSON.stringify(existente) === JSON.stringify(fila)) {
      sinCambios++;
    } else {
      mapa.set(fila.id, fila);
      actualizados++;
    }
  }

  return { insertados, actualizados, sinCambios };
}

function ordenarPorId<T extends { readonly id: string }>(filas: readonly T[]): readonly T[] {
  return [...filas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
