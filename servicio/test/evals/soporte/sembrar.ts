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

/** Un caso de intención que un caso de eval siembra (CAS8): su título es con lo que el agente lo consulta. */
export interface CasoSemilla {
  readonly titulo: string;
  readonly cuandoAplica: string;
  readonly texto: string;
  readonly modo?: 'literal' | 'guia';
  readonly activo?: boolean;
}

/**
 * Los casos de intención que todo caso de eval encuentra sembrados. Contra entrega y sin cobertura ya no están: el código no
 * los siembra (CAS13) y la eval que los necesita los declara en su `semilla.casos` (CAS12).
 */
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

/** Texto de cada caso de relleno: lo bastante largo para que un índice lleno no quepa en el prompt (CAS8). */
const TEXTO_RELLENO = 'Texto de relleno para probar un índice grande: no responde ninguna pregunta del cliente y solo ocupa espacio en el índice de casos de uso.';

/**
 * Casos de relleno para probar un índice grande (CAS8). Sus textos suman más que `MAX_CARACTERES_TEXTOS_EN_PROMPT`, así
 * el prompt lleva solo el índice y el modelo tiene que consultar el caso con `consultar_caso`: es el único camino que
 * ejercita esa herramienta, porque con pocos casos los textos ya viajan en el prompt.
 */
export function casosDeRelleno(cantidad: number): readonly CasoSemilla[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    titulo: `Relleno ${String(i + 1).padStart(3, '0')}`,
    cuandoAplica: 'Cuando el cliente pregunta por un tema de relleno.',
    texto: TEXTO_RELLENO,
  }));
}

/** Los textos de los casos activos que un caso de eval encuentra sembrados, por título: fuente de `textoLiteral`. */
export function textosDeCasosSembrados(semilla: { readonly casos?: readonly CasoSemilla[] } = {}): ReadonlyMap<string, string> {
  return new Map([...CASOS_SEMILLA_BASE, ...(semilla.casos ?? [])].filter((caso) => caso.activo !== false).map((caso) => [caso.titulo, caso.texto]));
}

/**
 * Deja los casos del asistente como los espera cada caso de eval (D5): borra los que dejó el anterior, siembra los casos base, suma los del caso (y `relleno` casos de relleno para probar un índice grande) y sube la versión compartida
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
  const categoria = await prisma.categoriaCaso.create({
    data: { nombre: 'Políticas', nombreNormalizado: normalizarNombre('Políticas'), orden: 0, creado: ahora, actualizado: ahora },
  });
  for (const caso of [...CASOS_SEMILLA_BASE, ...(semilla.casos ?? []), ...casosDeRelleno(semilla.relleno ?? 0)]) {
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
