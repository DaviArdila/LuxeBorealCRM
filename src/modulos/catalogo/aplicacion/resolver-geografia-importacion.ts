import { Inject, Injectable } from '@nestjs/common';
import { REPOSITORIO_GEOGRAFIA, type RepositorioGeografia } from '../../geografia/index.js';
import type { CatalogoLugares, LugarCiudad, LugarDepartamento } from '../dominio/resolver-lugar.js';

/**
 * Carga el catálogo geográfico completo (33 departamentos, ~1.120 ciudades DANE) una sola vez por
 * corrida de importación (D5): compone `listarDepartamentos()` con `listarCiudadesDe(id)` para cada
 * uno (`Promise.all`, 33 llamadas en paralelo) y mapea los tipos de `modulos/geografia` a los tipos
 * locales de `dominio/resolver-lugar.ts`. Este mapeo vive aquí, en `aplicacion/` (sí puede cruzar
 * módulos), porque la regla `dominio-aislado` prohíbe que `catalogo/dominio/` importe nada de
 * `modulos/geografia` (D5). Uso interno de `catalogo`: no se exporta en `catalogo/index.ts` (T8,
 * "Hecho cuando") — solo `ImportarCatalogo` (T9) lo inyecta.
 */
@Injectable()
export class ResolverGeografiaImportacion {
  constructor(
    @Inject(REPOSITORIO_GEOGRAFIA) private readonly repositorioGeografia: RepositorioGeografia,
  ) {}

  async ejecutar(): Promise<CatalogoLugares> {
    const departamentos = await this.repositorioGeografia.listarDepartamentos();

    const ciudadesPorDepartamento = await Promise.all(
      departamentos.map((departamento) => this.repositorioGeografia.listarCiudadesDe(departamento.id)),
    );

    const lugaresDepartamentos: readonly LugarDepartamento[] = departamentos.map((departamento) => ({
      id: departamento.id,
      nombre: departamento.nombre,
    }));

    const lugaresCiudades: readonly LugarCiudad[] = ciudadesPorDepartamento.flat().map((ciudad) => ({
      id: ciudad.id,
      departamentoId: ciudad.departamentoId,
      nombre: ciudad.nombre,
    }));

    return { departamentos: lugaresDepartamentos, ciudades: lugaresCiudades };
  }
}
