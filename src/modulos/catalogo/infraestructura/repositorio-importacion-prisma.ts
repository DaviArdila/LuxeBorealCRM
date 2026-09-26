import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import type {
  DatosImportacion,
  EstadoProductoActual,
  RepositorioImportacionCatalogo,
  ResultadoImportacion,
} from '../puertos/repositorio-importacion.js';

/**
 * Valor jsonb de entrada, con la misma forma recursiva que Prisma exige para `parametro.valor`
 * (`@db.JsonB`): se declara aquí en vez de importar el tipo del cliente generado, para que este
 * adaptador no dependa de las rutas internas de `plataforma/prisma` más allá de su barril
 * (`PrismaService`) — regla de fronteras `sin-rutas-internas-de-plataforma`. Un valor anidado
 * (dentro de un objeto o arreglo, ej. `horario_atencion.dom: null`, IMP7) sí puede ser `null`;
 * Prisma solo exige el sentinel `Prisma.JsonNull` para un `null` en la **raíz** de la columna, caso
 * que ningún parser de `validarParametros` (T2) produce hoy — de ahí `ValorJsonbEscribible` sin
 * `null` de raíz.
 */
type ValorJsonbAnidado =
  | string
  | number
  | boolean
  | null
  | { readonly [clave: string]: ValorJsonbAnidado }
  | readonly ValorJsonbAnidado[];
type ValorJsonbEscribible = Exclude<ValorJsonbAnidado, null>;

/** Medianoche UTC del día calendario de `fecha` (D6): compara por día, no por hora exacta. */
function inicioDelDia(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

/** Mismo criterio de "día calendario pasado" que `esFechaPasada` de `dominio/validar-catalogo.ts` (no exportado desde ahí). */
function esFechaPasada(fecha: Date, hoy: Date): boolean {
  return inicioDelDia(fecha).getTime() < inicioDelDia(hoy).getTime();
}

/**
 * Adaptador Prisma del puerto {@link RepositorioImportacionCatalogo} (design.md D6, D8, IMP11).
 * `escribirTodoONada` abre una sola `this.prisma.$transaction(async (tx) => {...})` **interna**
 * (D6: ningún servicio de transacción genérico existe todavía) con las seis escrituras de IMP11,
 * en el orden exacto de "Data Flow": upsert de productos por SKU, reemplazo completo de sus
 * fotos, desactivación (nunca borrado) de los productos ausentes de la hoja, reemplazo completo
 * de `tarifa_estimada`/`zona_sin_cobertura`, upsert de `parametro`, y sincronización de
 * `excepcion_horario` (solo fechas futuras, conserva las pasadas). Un fallo en cualquier paso
 * (por ejemplo, una restricción de clave foránea) revierte las seis escrituras completas —
 * comportamiento nativo de `$transaction`, verificado con un fallo real en
 * `repositorio-importacion.spec.ts`. Solo usa el *query builder* de Prisma, nunca `$queryRaw`
 * (matriz de amenazas de `tasks.md`).
 *
 * Nota de desviación (reportada, no silenciosa): el contrato canónico de `NuevoProductoImportado`
 * (design.md, "Interfaces / Contracts") no incluye un campo `activo` — a diferencia de
 * `ProductoValidado.activo` que sí valida IMP4 en `dominio/validar-catalogo.ts` (T2). Este
 * adaptador, fiel al puerto tal como está fijado, trata la sola presencia de un SKU en
 * `datos.productos` como "activo = true"; un producto ausente de la hoja se desactiva (IMP11).
 * Cómo `aplicacion/importar-catalogo.ts` (T9) traslada `ProductoValidado.activo` (un producto
 * marcado `activo = no` en la hoja, pero presente en ella) al puerto real queda para esa tarea —
 * el puerto no tiene hoy ningún campo que lo represente.
 */
@Injectable()
export class RepositorioImportacionPrisma implements RepositorioImportacionCatalogo {
  constructor(private readonly prisma: PrismaService) {}

  async leerEstadoActualPorSku(): Promise<ReadonlyMap<string, EstadoProductoActual>> {
    const productos = await this.prisma.producto.findMany({
      select: {
        sku: true,
        claveCollage: true,
        fotosHash: true,
        fotos: {
          select: { orden: true, claveArchivo: true, origenUrl: true },
          orderBy: { orden: 'asc' },
        },
      },
    });

    const estadoPorSku = new Map<string, EstadoProductoActual>();
    for (const producto of productos) {
      estadoPorSku.set(producto.sku, {
        fotos: producto.fotos.map((foto) => ({
          orden: foto.orden,
          claveArchivo: foto.claveArchivo,
          origenUrl: foto.origenUrl,
        })),
        fotosHash: producto.fotosHash,
        claveCollage: producto.claveCollage,
      });
    }
    return estadoPorSku;
  }

  async escribirTodoONada(datos: DatosImportacion, hoy: Date): Promise<ResultadoImportacion> {
    return this.prisma.$transaction(async (tx) => {
      const skusImportados = datos.productos.map((producto) => producto.sku);
      let fotosEscritas = 0;

      // 1-2. Upsert de productos por SKU + reemplazo completo de sus fotos (IMP11).
      for (const producto of datos.productos) {
        const filaProducto = await tx.producto.upsert({
          where: { sku: producto.sku },
          create: {
            sku: producto.sku,
            nombre: producto.nombre,
            descripcionCorta: producto.descripcionCorta,
            descripcionLarga: producto.descripcionLarga,
            precioCop: producto.precioCop,
            activo: true,
            pesoGramos: producto.pesoGramos,
            largoMm: producto.largoMm,
            anchoMm: producto.anchoMm,
            altoMm: producto.altoMm,
            claveCollage: producto.claveCollage,
            fotosHash: producto.fotosHash,
          },
          update: {
            nombre: producto.nombre,
            descripcionCorta: producto.descripcionCorta,
            descripcionLarga: producto.descripcionLarga,
            precioCop: producto.precioCop,
            activo: true,
            pesoGramos: producto.pesoGramos,
            largoMm: producto.largoMm,
            anchoMm: producto.anchoMm,
            altoMm: producto.altoMm,
            claveCollage: producto.claveCollage,
            fotosHash: producto.fotosHash,
          },
          select: { id: true },
        });

        await tx.foto.deleteMany({ where: { productoId: filaProducto.id } });
        if (producto.fotos.length > 0) {
          await tx.foto.createMany({
            data: producto.fotos.map((foto) => ({
              productoId: filaProducto.id,
              orden: foto.orden,
              claveArchivo: foto.claveArchivo,
              esPortada: foto.esPortada,
              origenUrl: foto.origenUrl,
            })),
          });
          fotosEscritas += producto.fotos.length;
        }
      }

      // 3. Desactivación (nunca borrado) de los productos ausentes de esta importación (IMP11).
      const { count: productosDesactivados } = await tx.producto.updateMany({
        where: { sku: { notIn: skusImportados }, activo: true },
        data: { activo: false },
      });

      // 4. Reemplazo completo de tarifa_estimada y zona_sin_cobertura (IMP11): sin un id estable
      // en la hoja que permita un upsert por fila, se borra todo y se recrea con esta importación.
      await tx.tarifaEstimada.deleteMany();
      if (datos.tarifas.length > 0) {
        await tx.tarifaEstimada.createMany({
          data: datos.tarifas.map((tarifa) => ({
            departamentoId: tarifa.departamentoId,
            ciudadId: tarifa.ciudadId,
            pesoMinG: tarifa.pesoMinG,
            pesoMaxG: tarifa.pesoMaxG,
            rangoMinCop: tarifa.rangoMinCop,
            rangoMaxCop: tarifa.rangoMaxCop,
            diasMin: tarifa.diasMin,
            diasMax: tarifa.diasMax,
            contraentregaDisponible: tarifa.contraentregaDisponible,
          })),
        });
      }

      await tx.zonaSinCobertura.deleteMany();
      if (datos.zonasSinCobertura.length > 0) {
        await tx.zonaSinCobertura.createMany({
          data: datos.zonasSinCobertura.map((zona) => ({
            departamentoId: zona.departamentoId,
            ciudadId: zona.ciudadId,
            motivo: zona.motivo,
          })),
        });
      }

      // 5. Upsert de parametro por clave (IMP7/IMP11): nunca borra una clave que la hoja ya no traiga.
      for (const parametro of datos.parametros) {
        const valor = parametro.valor as ValorJsonbEscribible;
        await tx.parametro.upsert({
          where: { clave: parametro.clave },
          create: { clave: parametro.clave, valor },
          update: { valor },
        });
      }

      // 6. Sincronización de excepcion_horario: solo se tocan las fechas de hoy en adelante; las
      // pasadas quedan como historial, nunca se borran ni se reescriben (IMP11).
      await tx.excepcionHorario.deleteMany({ where: { fecha: { gte: inicioDelDia(hoy) } } });
      const excepcionesFuturas = datos.excepciones.filter((excepcion) => !esFechaPasada(excepcion.fecha, hoy));
      if (excepcionesFuturas.length > 0) {
        await tx.excepcionHorario.createMany({
          data: excepcionesFuturas.map((excepcion) => ({ fecha: excepcion.fecha, motivo: excepcion.motivo })),
        });
      }

      return {
        productosActivados: datos.productos.length,
        productosDesactivados,
        fotosEscritas,
      };
    });
  }
}
