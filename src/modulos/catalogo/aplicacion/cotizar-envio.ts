import { Inject, Injectable } from '@nestjs/common';
import {
  armarCotizacionConCobertura,
  elegirTarifa,
  hayExclusion,
  pesoFacturableG,
  type DestinoEnvio,
  type LineaPeso,
  type ResultadoCotizacion,
} from '../dominio/envio.js';
import { REPOSITORIO_ENVIO, type RepositorioEnvio } from '../puertos/repositorio-envio.js';
import { REPOSITORIO_PARAMETRO_CATALOGO, type RepositorioParametroCatalogo } from '../puertos/repositorio-parametro.js';
import { REPOSITORIO_PRODUCTO, type RepositorioProducto } from '../puertos/repositorio-producto.js';

/**
 * Caso de uso de cotización de envío (design.md "Data Flow", CAT6-CAT11): orquestador fino que
 * calcula el peso facturable del producto, comprueba exclusión de cobertura (CAT7) antes que
 * elegir tarifa (CAT8, D3, prioridad ya fijada por el dominio), y arma la cotización. Sin
 * cobertura — por exclusión o por ausencia de tarifa que aplique — registra el evento (CAT9, D7:
 * `departamentoId`/`ciudadId` siempre `null` en esta fase) y devuelve el mensaje leído del
 * parámetro del negocio, sin ningún rango (CAT11). Un producto no encontrado no rechaza: cotiza
 * con peso cero (ninguna línea de peso), igual que un producto sin peso ni medidas (CAT6).
 */
@Injectable()
export class CotizarEnvio {
  constructor(
    @Inject(REPOSITORIO_PRODUCTO) private readonly repositorioProducto: RepositorioProducto,
    @Inject(REPOSITORIO_PARAMETRO_CATALOGO) private readonly repositorioParametro: RepositorioParametroCatalogo,
    @Inject(REPOSITORIO_ENVIO) private readonly repositorioEnvio: RepositorioEnvio,
  ) {}

  async ejecutar(idOSku: string, destino: DestinoEnvio, cantidad = 1): Promise<ResultadoCotizacion> {
    const producto = await this.repositorioProducto.buscarPorIdOSku(idOSku);

    const lineas: readonly LineaPeso[] = producto
      ? [
          {
            cantidad,
            pesoGramos: producto.pesoGramos,
            largoMm: producto.largoMm,
            anchoMm: producto.anchoMm,
            altoMm: producto.altoMm,
          },
        ]
      : [];
    const factorVolumetrico = await this.repositorioParametro.obtenerFactorVolumetrico();
    const pesoG = pesoFacturableG(lineas, factorVolumetrico);

    const exclusiones = await this.repositorioEnvio.listarExclusiones();
    if (hayExclusion(exclusiones, destino)) {
      return this.registrarSinCobertura(producto?.id ?? null, destino);
    }

    const tarifas = await this.repositorioEnvio.listarTarifas();
    const tarifa = elegirTarifa(tarifas, destino, pesoG);
    if (!tarifa) {
      return this.registrarSinCobertura(producto?.id ?? null, destino);
    }

    return armarCotizacionConCobertura(tarifa);
  }

  private async registrarSinCobertura(productoId: string | null, destino: DestinoEnvio): Promise<ResultadoCotizacion> {
    await this.repositorioEnvio.registrarEventoFueraCobertura({
      productoId,
      departamentoTexto: destino.departamento,
      ciudadTexto: destino.ciudad ?? null,
      departamentoId: null,
      ciudadId: null,
    });
    const mensaje = await this.repositorioParametro.obtenerMensajeFueraCobertura();
    return { cobertura: false, mensaje };
  }
}
