import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { construirIndice, type EntradaIndice } from '../dominio/indice.js';
import { normalizarNombre } from '../dominio/normalizar.js';
import { textoDeRespaldo, type ClaveSistema } from '../dominio/sistema.js';
import type { ConsultaCasos, ResultadoCaso } from '../puertos/consulta-casos.js';
import { REPOSITORIO_CASOS, type CasoDeIntencion, type RepositorioCasos } from '../puertos/repositorio-casos.js';
import type { TextosAsistente } from '../puertos/textos-asistente.js';
import { VERSION_ASISTENTE, type VersionAsistente } from '../puertos/version-asistente.js';

/**
 * TTL de respaldo (ADR-0020, D3 de la Fase 12): resiliencia técnica, no un dato del negocio (R15 no aplica). Sirve si la
 * versión compartida se pierde sin que nadie haya editado, igual que en `ProveedorEstilo`.
 */
const TTL_RESPALDO_MS = 5 * 60_000;

/** Lo que se guarda en memoria mientras la versión compartida no cambie: los textos del sistema y los casos de intención. */
interface Datos {
  readonly textos: ReadonlyMap<string, string>;
  readonly intencion: readonly CasoDeIntencion[];
}

interface Copia {
  readonly versionCompartida: string;
  readonly expiraEn: number;
  readonly datos: Datos;
}

const SIN_DATOS: Datos = { textos: new Map(), intencion: [] };

/**
 * Entrega los textos de los casos del sistema y consulta los de intención (CAS7, CAS8, D3 de la Fase 12): lee de
 * `caso_asistente` con el texto del código como respaldo y guarda una copia en memoria mientras la versión compartida de
 * Redis no cambie. Nunca lanza: si la base falla rige el respaldo y el índice sale vacío (sin guardar copia, para reintentar),
 * y si Redis falla no hay copia confiable y se lee la base. Estado de **instancia**, nunca un `let` de módulo; el tiempo sale
 * del `Clock` inyectado. Nunca escribe un texto en logs (R14): solo conteos.
 */
@Injectable()
export class ProveedorTextos implements TextosAsistente, ConsultaCasos {
  private readonly logger = new Logger(ProveedorTextos.name);
  private copia: Copia | null = null;

  constructor(
    @Inject(REPOSITORIO_CASOS)
    private readonly repositorio: Pick<RepositorioCasos, 'leerTextosDelSistema' | 'leerCasosDeIntencion'>,
    @Inject(VERSION_ASISTENTE) private readonly version: VersionAsistente,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async textoDelSistema(clave: ClaveSistema): Promise<string> {
    const guardado = (await this.datos()).textos.get(clave);
    return guardado !== undefined && guardado.trim().length > 0 ? guardado : textoDeRespaldo(clave);
  }

  async indice(): Promise<readonly EntradaIndice[]> {
    const { intencion } = await this.datos();
    const indice = construirIndice(intencion);
    if (indice.recortado) {
      this.logger.warn({ evento: 'asistente.indice-recortado', total: indice.total, incluidos: indice.entradas.length });
    }
    return indice.entradas.map(({ titulo, cuandoAplica }) => ({ titulo, cuandoAplica }));
  }

  async consultar(titulo: string): Promise<ResultadoCaso> {
    const { intencion } = await this.datos();
    const buscado = normalizarNombre(titulo);
    const caso = intencion.find((candidato) => candidato.tituloNormalizado === buscado);
    return caso === undefined
      ? { encontrado: false, titulosDisponibles: intencion.map((candidato) => candidato.titulo) }
      : { encontrado: true, titulo: caso.titulo, modo: caso.modo, texto: caso.texto };
  }

  private async datos(): Promise<Datos> {
    const versionCompartida = await this.leerVersionCompartida();
    const ahora = this.clock.ahora().getTime();
    if (
      versionCompartida !== null &&
      this.copia !== null &&
      this.copia.versionCompartida === versionCompartida &&
      this.copia.expiraEn > ahora
    ) {
      return this.copia.datos;
    }

    try {
      const [textos, intencion] = await Promise.all([this.repositorio.leerTextosDelSistema(), this.repositorio.leerCasosDeIntencion()]);
      const datos: Datos = { textos, intencion };
      this.copia = versionCompartida === null ? null : { versionCompartida, expiraEn: ahora + TTL_RESPALDO_MS, datos };
      return datos;
    } catch {
      this.logger.warn({ evento: 'asistente.textos-base-no-disponible' });
      this.copia = null;
      return SIN_DATOS;
    }
  }

  /** `null` si Redis no responde: sin versión confiable no se guarda copia. */
  private async leerVersionCompartida(): Promise<string | null> {
    try {
      return await this.version.obtener();
    } catch {
      this.logger.warn({ evento: 'asistente.textos-sin-version-compartida' });
      return null;
    }
  }
}
