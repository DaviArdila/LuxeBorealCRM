import { Inject, Injectable, Logger } from '@nestjs/common';
import { normalizarTexto } from '../../../compartido/texto/index.js';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { validarSeccionEstilo } from '../dominio/validar-estilo.js';
import type { AutorEstilo } from '../puertos/repositorio-estilo.js';
import {
  REPOSITORIO_SECCIONES_ESTILO,
  type RepositorioSeccionesEstilo,
  type ResultadoCambioSecciones,
  type SeccionEstilo,
} from '../puertos/repositorio-secciones-estilo.js';
import { VERSION_ESTILO, type VersionEstilo } from '../puertos/version-estilo.js';

/** Lo que el admin escribe de una sección. */
export interface EntradaSeccionEstilo {
  readonly titulo: string;
  readonly texto: string;
  readonly activo: boolean;
}

/**
 * Administra las secciones del estilo (crear, editar, apagar, reordenar). Valida cada sección (EST-S2); el repositorio
 * valida el estilo compuesto y guarda su foto en `version_estilo` dentro de la misma transacción. Tras confirmar, sube la
 * versión compartida para que todos los procesos lean el estilo nuevo; si Redis falla el cambio ya está hecho y el TTL de
 * respaldo de `ProveedorEstilo` alcanza a los demás procesos. Nunca escribe un texto en logs (R14).
 */
@Injectable()
export class AdministrarSeccionesEstilo {
  private readonly logger = new Logger(AdministrarSeccionesEstilo.name);

  constructor(
    @Inject(REPOSITORIO_SECCIONES_ESTILO) private readonly repositorio: RepositorioSeccionesEstilo,
    @Inject(VERSION_ESTILO) private readonly version: VersionEstilo,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  listar(): Promise<readonly SeccionEstilo[]> {
    return this.repositorio.listar();
  }

  async crear(entrada: EntradaSeccionEstilo, autor?: AutorEstilo): Promise<ResultadoCambioSecciones<SeccionEstilo>> {
    const datos = prepararDatos(entrada);
    const invalida = validarEntrada(datos);
    if (invalida !== null) return invalida;
    return this.publicar(await this.repositorio.crear(datos, this.clock.ahora(), autor));
  }

  async editar(
    id: string,
    entrada: EntradaSeccionEstilo,
    actualizadoLeido: Date,
    autor?: AutorEstilo,
  ): Promise<ResultadoCambioSecciones<SeccionEstilo>> {
    const datos = prepararDatos(entrada);
    const invalida = validarEntrada(datos);
    if (invalida !== null) return invalida;
    return this.publicar(await this.repositorio.editar(id, datos, actualizadoLeido, this.clock.ahora(), autor));
  }

  async reordenar(ids: readonly string[], autor?: AutorEstilo): Promise<ResultadoCambioSecciones<readonly SeccionEstilo[]>> {
    return this.publicar(await this.repositorio.reordenar(ids, this.clock.ahora(), autor));
  }

  private async publicar<T>(resultado: ResultadoCambioSecciones<T>): Promise<ResultadoCambioSecciones<T>> {
    if (resultado.ok && resultado.version !== null) {
      try {
        await this.version.incrementar();
      } catch {
        this.logger.warn({ evento: 'agente.estilo-version-compartida-no-actualizada', version: resultado.version });
      }
    }
    return resultado;
  }
}

function prepararDatos(entrada: EntradaSeccionEstilo) {
  const titulo = entrada.titulo.trim();
  return { titulo, tituloNormalizado: normalizarTexto(titulo), texto: entrada.texto, activo: entrada.activo };
}

function validarEntrada(datos: { titulo: string; texto: string }): { ok: false; razon: 'invalido'; motivo: string } | null {
  const validacion = validarSeccionEstilo(datos);
  return validacion.valido ? null : { ok: false, razon: 'invalido', motivo: validacion.motivo };
}
