import { RepositorioCasosPrisma } from '../../../src/modulos/asistente/infraestructura/prisma/repositorio-casos-prisma.js';
import { normalizarNombre, textoDeBusqueda } from '../../../src/modulos/asistente/dominio/normalizar.js';
import type { VersionAsistente } from '../../../src/modulos/asistente/puertos/version-asistente.js';
import type { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockSistema } from '../../../src/plataforma/reloj/index.js';

/** Semilla estable del catálogo de las evals (D5): SKU fijos para que los guiones los nombren. */
export const SKU = {
  anillo: 'SKU-EVAL-ANILLO',
  collar: 'SKU-EVAL-COLLAR',
  pulsera: 'SKU-EVAL-PULSERA',
  inactivo: 'SKU-EVAL-INACTIVO',
} as const;

export const PRECIO_ANILLO_COP = 389_000;
export const PRECIO_COLLAR_COP = 259_000;

/** Texto del caso `contra_entrega` en las evals: corto y sin porcentaje, como el aprobado por el negocio. */
export const TEXTO_CONTRA_ENTREGA_SEMILLA =
  'Tu pedido se envía contra entrega: pagas cuando lo recibes. El recargo por contra entrega se suma al total de tu compra.';

/** Un caso de intención que un caso de eval siembra (CAS8): su título es con lo que el agente lo consulta. */
export interface CasoSemilla {
  readonly titulo: string;
  readonly cuandoAplica: string;
  readonly texto: string;
  readonly modo?: 'literal' | 'guia';
  readonly activo?: boolean;
}

/** Los casos de intención que todo caso de eval encuentra sembrados, además de `contra_entrega`. */
export const CASOS_SEMILLA_BASE: readonly CasoSemilla[] = [
  {
    titulo: 'Devoluciones',
    cuandoAplica: 'Cuando el cliente pregunta si puede devolver o cambiar un producto.',
    texto: 'Aceptamos cambios y devoluciones dentro de los 5 días siguientes a la entrega, con el producto sin uso.',
  },
];

const DEPARTAMENTOS = [
  { id: '05', nombre: 'Antioquia' },
  { id: '11', nombre: 'Bogotá D.C.' },
  { id: '97', nombre: 'Vaupés' },
] as const;

/**
 * Deja la base de prueba con el catálogo, la cobertura (Vaupés excluido), una tarifa nacional con
 * contra entrega y las políticas base. Idempotente: cada caso la puede volver a llamar (D5).
 */
export async function sembrarBase(prisma: PrismaService): Promise<void> {
  for (const departamento of DEPARTAMENTOS) {
    await prisma.departamento.upsert({ where: { id: departamento.id }, create: departamento, update: {} });
  }
  const vaupes = await prisma.zonaSinCobertura.findFirst({ where: { departamentoId: '97', ciudadId: null } });
  if (vaupes === null) {
    await prisma.zonaSinCobertura.create({ data: { departamentoId: '97', motivo: 'sin cobertura de la transportadora' } });
  }
  if ((await prisma.tarifaEstimada.count({ where: { departamentoId: null } })) === 0) {
    await prisma.tarifaEstimada.create({
      data: { rangoMinCop: 12_000, rangoMaxCop: 18_000, diasMin: 2, diasMax: 4, contraentregaDisponible: true },
    });
  }

  const productos = [
    { sku: SKU.anillo, nombre: 'Anillo Aurora', corta: 'Oro laminado 18k', larga: 'Anillo de oro laminado 18k con acabado brillante.', precio: PRECIO_ANILLO_COP, activo: true, fotos: true },
    { sku: SKU.collar, nombre: 'Collar Luna', corta: 'Plata 925 con dije de luna', larga: 'Collar de plata 925 con un dije de luna.', precio: PRECIO_COLLAR_COP, activo: true, fotos: true },
    { sku: SKU.pulsera, nombre: 'Pulsera Sol', corta: 'Acero dorado ajustable', larga: 'Pulsera de acero dorado, ajustable.', precio: 149_000, activo: true, fotos: false },
    { sku: SKU.inactivo, nombre: 'Aretes Estrella', corta: 'Descontinuados', larga: 'Aretes descontinuados.', precio: 99_000, activo: false, fotos: false },
  ];
  for (const producto of productos) {
    const existente = await prisma.producto.findUnique({ where: { sku: producto.sku } });
    if (existente !== null) continue;
    await prisma.producto.create({
      data: {
        sku: producto.sku,
        nombre: producto.nombre,
        descripcionCorta: producto.corta,
        descripcionLarga: producto.larga,
        precioCop: producto.precio,
        activo: producto.activo,
        ...(producto.fotos
          ? {
              fotos: {
                create: (['frente', 'lateral_izquierdo', 'detalle'] as const).map((angulo, orden) => ({
                  orden,
                  esPortada: orden === 0,
                  angulo,
                  claveArchivo: `evals/${producto.sku}/foto-${String(orden + 1)}.jpg`,
                })),
              },
            }
          : {}),
      },
    });
  }
}

/**
 * Deja los casos del asistente como los espera cada caso de eval (D5): borra los que dejó el anterior, siembra `contra_entrega`
 * y los casos base, suma los del caso (y `relleno` casos de relleno para probar un índice grande) y sube la versión compartida
 * para que la copia en memoria de la aplicación los lea. Determinista: dos corridas dejan lo mismo.
 */
export async function restablecerCasos(
  prisma: PrismaService,
  version: Pick<VersionAsistente, 'incrementar'>,
  semilla: { readonly casos?: readonly CasoSemilla[]; readonly relleno?: number } = {},
): Promise<void> {
  const ahora = new ClockSistema().ahora();
  await prisma.casoAsistente.deleteMany();
  await prisma.categoriaCaso.deleteMany();
  // `guardarTextoDelSistema` crea el caso y la categoría «Políticas» si faltan.
  await new RepositorioCasosPrisma(prisma).guardarTextoDelSistema('contra_entrega', TEXTO_CONTRA_ENTREGA_SEMILLA, ahora);
  const categoria = await prisma.categoriaCaso.findUniqueOrThrow({ where: { nombreNormalizado: normalizarNombre('Políticas') } });
  const relleno: CasoSemilla[] = Array.from({ length: semilla.relleno ?? 0 }, (_, i) => ({
    titulo: `Relleno ${String(i + 1).padStart(3, '0')}`,
    cuandoAplica: 'Cuando el cliente pregunta por un tema de relleno.',
    texto: 'Texto de relleno.',
  }));
  for (const caso of [...CASOS_SEMILLA_BASE, ...(semilla.casos ?? []), ...relleno]) {
    await prisma.casoAsistente.create({
      data: {
        categoriaId: categoria.id,
        titulo: caso.titulo,
        tituloNormalizado: normalizarNombre(caso.titulo),
        cuandoAplica: caso.cuandoAplica,
        disparador: 'intencion',
        modo: caso.modo ?? 'literal',
        texto: caso.texto,
        activo: caso.activo ?? true,
        busquedaNormalizada: textoDeBusqueda(caso),
        creado: ahora,
        actualizado: ahora,
      },
    });
  }
  await version.incrementar();
}
