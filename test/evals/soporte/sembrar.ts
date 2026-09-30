import type { PrismaService } from '../../../src/plataforma/prisma/index.js';

/** Semilla estable del catálogo de las evals (D5): SKU fijos para que los guiones los nombren. */
export const SKU = {
  anillo: 'SKU-EVAL-ANILLO',
  collar: 'SKU-EVAL-COLLAR',
  pulsera: 'SKU-EVAL-PULSERA',
  inactivo: 'SKU-EVAL-INACTIVO',
} as const;

export const PRECIO_ANILLO_COP = 389_000;
export const PRECIO_COLLAR_COP = 259_000;

export const POLITICAS_SEMILLA: Readonly<Record<string, string>> = {
  contra_entrega:
    'Tu pedido se envía contra entrega: pagas cuando lo recibes. El recargo por contra entrega se suma al total de tu compra.',
  devoluciones: 'Aceptamos cambios y devoluciones dentro de los 5 días siguientes a la entrega, con el producto sin uso.',
};

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
              claveCollage: `evals/${producto.sku}/collage.jpg`,
              fotos: { create: [0, 1, 2].map((orden) => ({ orden, esPortada: orden === 0, claveArchivo: `evals/${producto.sku}/foto-${String(orden + 1)}.jpg` })) },
            }
          : {}),
      },
    });
  }
  await fijarPoliticas(prisma, POLITICAS_SEMILLA);
}

/** Escribe (o borra, con `null`) filas `politica_<tema>` de `parametro`. */
export async function fijarPoliticas(
  prisma: PrismaService,
  politicas: Readonly<Record<string, string | null>>,
): Promise<void> {
  for (const [tema, texto] of Object.entries(politicas)) {
    const clave = `politica_${tema}`;
    if (texto === null) {
      await prisma.parametro.deleteMany({ where: { clave } });
    } else {
      await prisma.parametro.upsert({ where: { clave }, create: { clave, valor: texto }, update: { valor: texto } });
    }
  }
}
