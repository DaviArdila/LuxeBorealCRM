import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { componerEstilo } from '../../dominio/secciones-estilo.js';
import { validarEstilo } from '../../dominio/validar-estilo.js';
import type { AutorEstilo } from '../../puertos/repositorio-estilo.js';
import type {
  DatosSeccionEstilo,
  RepositorioSeccionesEstilo,
  ResultadoCambioSecciones,
  SeccionEstilo,
} from '../../puertos/repositorio-secciones-estilo.js';
import { bloquearEstilo, guardarFotoDelEstilo, type TransaccionPrisma } from './foto-estilo.js';

const CODIGO_UNICO_VIOLADO = 'P2002';

/** Duck-typing del código de Prisma (como los demás repositorios): no necesita el namespace del cliente generado. */
function esErrorDePrisma(error: unknown, codigo: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { readonly code?: unknown }).code === codigo;
}

/** El estilo compuesto que resultaría del cambio no es válido: aborta la transacción y se traduce a `invalido`. */
class EstiloCompuestoInvalido extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
  }
}

/** Un fallo previsto dentro de la transacción (fila ausente, marca vieja…): también aborta y se traduce a su razón. */
class CambioRechazado extends Error {
  constructor(readonly razon: 'inexistente' | 'modificado' | 'no-coincide') {
    super(razon);
  }
}

function aSeccion(fila: SeccionEstilo): SeccionEstilo {
  return {
    id: fila.id,
    titulo: fila.titulo,
    texto: fila.texto,
    orden: fila.orden,
    activo: fila.activo,
    creado: fila.creado,
    actualizado: fila.actualizado,
  };
}

/**
 * Adaptador Prisma de {@link RepositorioSeccionesEstilo} sobre `seccion_estilo`. Cada cambio corre en una transacción con
 * el candado del estilo: aplica el cambio, compone las secciones activas, valida el compuesto (`validarEstilo`) y, si el
 * texto difiere del vigente, guarda su foto en `version_estilo`. Si algo falla se deshace todo. La unicidad del título
 * la impone la base (un `P2002` es `duplicada`, también entre dos admins simultáneos). Nunca escribe un texto en logs (R14).
 */
@Injectable()
export class RepositorioSeccionesEstiloPrisma implements RepositorioSeccionesEstilo {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<readonly SeccionEstilo[]> {
    const filas = await this.prisma.seccionEstilo.findMany({ orderBy: [{ orden: 'asc' }, { tituloNormalizado: 'asc' }] });
    return filas.map(aSeccion);
  }

  crear(datos: DatosSeccionEstilo, ahora: Date, autor?: AutorEstilo | null): Promise<ResultadoCambioSecciones<SeccionEstilo>> {
    return this.cambiar(ahora, autor, async (tx) => {
      const mayor = await tx.seccionEstilo.aggregate({ _max: { orden: true } });
      const fila = await tx.seccionEstilo.create({
        data: { ...datosEscribibles(datos), orden: (mayor._max.orden ?? -1) + 1, creado: ahora, actualizado: ahora },
      });
      return aSeccion(fila);
    });
  }

  editar(
    id: string,
    datos: DatosSeccionEstilo,
    actualizadoLeido: Date,
    ahora: Date,
    autor?: AutorEstilo | null,
  ): Promise<ResultadoCambioSecciones<SeccionEstilo>> {
    return this.cambiar(ahora, autor, async (tx) => {
      const { count } = await tx.seccionEstilo.updateMany({
        where: { id, actualizado: actualizadoLeido },
        data: { ...datosEscribibles(datos), actualizado: ahora },
      });
      if (count === 0) {
        const existe = (await tx.seccionEstilo.findUnique({ where: { id }, select: { id: true } })) !== null;
        throw new CambioRechazado(existe ? 'modificado' : 'inexistente');
      }
      return aSeccion(await tx.seccionEstilo.findUniqueOrThrow({ where: { id } }));
    });
  }

  reordenar(ids: readonly string[], ahora: Date, autor?: AutorEstilo | null): Promise<ResultadoCambioSecciones<readonly SeccionEstilo[]>> {
    return this.cambiar(ahora, autor, async (tx) => {
      const existentes = (await tx.seccionEstilo.findMany({ select: { id: true } })).map((fila) => fila.id).sort();
      const pedidas = [...ids].sort();
      if (existentes.length !== pedidas.length || existentes.some((id, indice) => id !== pedidas[indice])) {
        throw new CambioRechazado('no-coincide');
      }
      for (const [orden, id] of ids.entries()) {
        await tx.seccionEstilo.update({ where: { id }, data: { orden, actualizado: ahora } });
      }
      const filas = await tx.seccionEstilo.findMany({ orderBy: { orden: 'asc' } });
      return filas.map(aSeccion);
    });
  }

  private async cambiar<T>(
    ahora: Date,
    autor: AutorEstilo | null | undefined,
    aplicar: (tx: TransaccionPrisma) => Promise<T>,
  ): Promise<ResultadoCambioSecciones<T>> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await bloquearEstilo(tx);
        const valor = await aplicar(tx);
        return { ok: true as const, valor, version: await this.guardarFotoSiCambio(tx, ahora, autor) };
      });
    } catch (error) {
      if (error instanceof EstiloCompuestoInvalido) return { ok: false, razon: 'invalido', motivo: error.motivo };
      if (error instanceof CambioRechazado) return { ok: false, razon: error.razon };
      if (esErrorDePrisma(error, CODIGO_UNICO_VIOLADO)) return { ok: false, razon: 'duplicada' };
      throw error;
    }
  }

  /** Valida el compuesto y guarda su foto; `null` si es igual al vigente (nada cambió para el bot). */
  private async guardarFotoSiCambio(tx: TransaccionPrisma, ahora: Date, autor: AutorEstilo | null | undefined): Promise<number | null> {
    const compuesto = componerEstilo(await tx.seccionEstilo.findMany({ where: { activo: true } }));
    const validacion = validarEstilo(compuesto);
    if (!validacion.valido) throw new EstiloCompuestoInvalido(validacion.motivo);
    const vigente = await tx.versionEstilo.findFirst({ where: { vigente: true }, select: { texto: true } });
    if (vigente?.texto === compuesto) return null;
    return guardarFotoDelEstilo(tx, compuesto, ahora, autor);
  }
}

function datosEscribibles(datos: DatosSeccionEstilo) {
  return { titulo: datos.titulo, tituloNormalizado: datos.tituloNormalizado, texto: datos.texto, activo: datos.activo };
}
