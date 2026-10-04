import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import type { CatalogoGeografico, Ciudad, Departamento } from '../dominio/geografia.js';
import type {
  ConteoGuardado,
  RepositorioGeografia,
  ResumenGuardado,
} from '../puertos/repositorio-geografia.js';

/** Fila devuelta por `RETURNING (xmax = 0) AS insertada` (design.md D8). */
interface FilaUpsert {
  readonly insertada: boolean;
}

/**
 * Adaptador Prisma del puerto {@link RepositorioGeografia} (design.md D8). `guardarCatalogo` hace
 * upsert por código DANE dentro de una transacción por lotes (`$transaction([...])`, sin helper de
 * transacción propio — D5), con `$queryRaw` en plantilla etiquetada y parámetros — nunca
 * `$queryRawUnsafe` (matriz de amenazas de `tasks.md`). Gracias a `IS DISTINCT FROM`, una fila sin
 * cambios no se reescribe, y ninguna fila existente se borra jamás.
 */
@Injectable()
export class RepositorioGeografiaPrisma implements RepositorioGeografia {
  constructor(private readonly prisma: PrismaService) {}

  async guardarCatalogo(catalogo: CatalogoGeografico): Promise<ResumenGuardado> {
    const [filasDepartamentos, filasCiudades] = await this.prisma.$transaction([
      this.consultaUpsertDepartamentos(catalogo.departamentos),
      this.consultaUpsertCiudades(catalogo.ciudades),
    ]);

    return {
      departamentos: resumirConteo(filasDepartamentos, catalogo.departamentos.length),
      ciudades: resumirConteo(filasCiudades, catalogo.ciudades.length),
    };
  }

  async listarDepartamentos(): Promise<readonly Departamento[]> {
    return this.prisma.departamento.findMany({ orderBy: { id: 'asc' } });
  }

  async listarCiudadesDe(departamentoId: string): Promise<readonly Ciudad[]> {
    return this.prisma.ciudad.findMany({
      where: { departamentoId },
      orderBy: { id: 'asc' },
    });
  }

  private consultaUpsertDepartamentos(departamentos: readonly Departamento[]) {
    const ids = departamentos.map((departamento) => departamento.id);
    const nombres = departamentos.map((departamento) => departamento.nombre);

    return this.prisma.$queryRaw<FilaUpsert[]>`
      INSERT INTO departamento (id, nombre)
      SELECT * FROM unnest(${ids}::text[], ${nombres}::text[])
      ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre
      WHERE departamento.nombre IS DISTINCT FROM EXCLUDED.nombre
      RETURNING (xmax = 0) AS insertada
    `;
  }

  private consultaUpsertCiudades(ciudades: readonly Ciudad[]) {
    const ids = ciudades.map((ciudad) => ciudad.id);
    const departamentoIds = ciudades.map((ciudad) => ciudad.departamentoId);
    const nombres = ciudades.map((ciudad) => ciudad.nombre);

    return this.prisma.$queryRaw<FilaUpsert[]>`
      INSERT INTO ciudad (id, departamento_id, nombre)
      SELECT * FROM unnest(${ids}::text[], ${departamentoIds}::text[], ${nombres}::text[])
      ON CONFLICT (id) DO UPDATE SET
        departamento_id = EXCLUDED.departamento_id,
        nombre = EXCLUDED.nombre
      WHERE (ciudad.departamento_id, ciudad.nombre) IS DISTINCT FROM (EXCLUDED.departamento_id, EXCLUDED.nombre)
      RETURNING (xmax = 0) AS insertada
    `;
  }
}

/** Una fila sin cambios nunca aparece en el `RETURNING` (D8): `sinCambios` es lo que falta. */
function resumirConteo(filas: readonly FilaUpsert[], total: number): ConteoGuardado {
  const insertados = filas.filter((fila) => fila.insertada).length;
  const actualizados = filas.length - insertados;
  return { insertados, actualizados, sinCambios: total - filas.length };
}
