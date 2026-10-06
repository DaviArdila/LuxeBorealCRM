import { ProveedorTextos } from '../../src/modulos/asistente/aplicacion/proveedor-textos.js';
import { RepositorioCasosPrisma } from '../../src/modulos/asistente/infraestructura/prisma/repositorio-casos-prisma.js';
import type { ClaveSistema } from '../../src/modulos/asistente/index.js';
import type { VersionAsistente } from '../../src/modulos/asistente/puertos/version-asistente.js';
import type { PrismaService } from '../../src/plataforma/prisma/index.js';
import { ClockSistema } from '../../src/plataforma/reloj/index.js';

/**
 * Deja el texto de uno o más casos del sistema en la base de prueba (los crea con su título y categoría si faltan), con la
 * misma escritura que usa la aplicación. Reemplaza a escribir las claves `mensaje_*` en `parametro` (T5 de la Fase 12).
 */
export async function fijarTextosDelSistema(
  prisma: PrismaService,
  textos: Partial<Record<ClaveSistema, string>>,
  ahora?: Date,
): Promise<void> {
  const instante = ahora ?? new ClockSistema().ahora();
  const repositorio = new RepositorioCasosPrisma(prisma);
  for (const [clave, texto] of Object.entries(textos)) {
    await repositorio.guardarTextoDelSistema(clave as ClaveSistema, texto, instante);
  }
}

/** Borra todos los casos y categorías: cada archivo de integración parte de una base sin casos. */
export async function limpiarCasos(prisma: PrismaService): Promise<void> {
  await prisma.casoAsistente.deleteMany();
  await prisma.categoriaCaso.deleteMany();
}

/** Una versión compartida que siempre falla: sin versión confiable el proveedor no guarda copia y lee la base cada vez. */
const VERSION_SIN_REDIS: VersionAsistente = {
  obtener: () => Promise.reject(new Error('sin redis en la prueba')),
  incrementar: () => Promise.resolve(),
};

/** El puerto de textos real sobre Postgres, sin copia en memoria: cada lectura ve lo último que se escribió. */
export function textosSinCopia(prisma: PrismaService): ProveedorTextos {
  return new ProveedorTextos(new RepositorioCasosPrisma(prisma), VERSION_SIN_REDIS, new ClockSistema());
}
