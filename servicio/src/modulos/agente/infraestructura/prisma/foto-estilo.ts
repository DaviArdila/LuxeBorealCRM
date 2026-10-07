import type { PrismaService } from '../../../../plataforma/prisma/index.js';
import { MAX_VERSIONES_HISTORIAL, type AutorEstilo } from '../../puertos/repositorio-estilo.js';

/** Cliente transaccional de Prisma: lo que recibe el callback de `$transaction`. */
export type TransaccionPrisma = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/** Clave del candado consultivo que serializa los cambios del estilo (no es una clave de `parametro`). */
const CLAVE_CANDADO = 'version_estilo';

/**
 * Serializa a quienes cambian el estilo a la vez, sean secciones o publicaciones completas. El candado es por clave y no
 * por fila porque la primera publicación aún no tiene filas que bloquear; se suelta solo al cerrar la transacción.
 */
export async function bloquearEstilo(tx: TransaccionPrisma): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CLAVE_CANDADO}))`;
}

/**
 * Guarda `texto` como la versión vigente de `version_estilo`: la vigente pasa a retirada, se inserta la nueva y se poda lo
 * que exceda el historial (AGT21). Debe correr dentro de una transacción con el candado de {@link bloquearEstilo}.
 * Devuelve el número de la versión nueva.
 */
export async function guardarFotoDelEstilo(
  tx: TransaccionPrisma,
  texto: string,
  fecha: Date,
  autor?: AutorEstilo | null,
): Promise<number> {
  const mayor = await tx.versionEstilo.aggregate({ _max: { version: true } });
  const nueva = (mayor._max.version ?? 0) + 1;

  await tx.versionEstilo.updateMany({ where: { vigente: true }, data: { vigente: false } });
  await tx.versionEstilo.create({
    data: {
      version: nueva,
      texto,
      vigente: true,
      publicadoEn: fecha,
      publicadoPorId: autor?.id ?? null,
      publicadoPorNombre: autor?.nombre ?? null,
    },
  });

  const sobrantes = await tx.versionEstilo.findMany({
    where: { vigente: false },
    orderBy: { version: 'desc' },
    skip: MAX_VERSIONES_HISTORIAL,
    select: { id: true },
  });
  if (sobrantes.length > 0) {
    await tx.versionEstilo.deleteMany({ where: { id: { in: sobrantes.map((fila) => fila.id) } } });
  }
  return nueva;
}
