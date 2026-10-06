import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { MAX_CARACTERES_CATEGORIA, type Categoria } from '../dominio/administracion.js';
import { normalizarNombre } from '../dominio/normalizar.js';
import { REPOSITORIO_ADMINISTRACION, type RepositorioAdministracion } from '../puertos/repositorio-administracion.js';
import { VERSION_ASISTENTE, type VersionAsistente } from '../puertos/version-asistente.js';
import { subirVersion } from './subir-version.js';

export type ResultadoCategoria =
  | { readonly ok: true; readonly categoria: Categoria }
  | { readonly ok: false; readonly razon: 'duplicada' | 'inexistente' }
  | { readonly ok: false; readonly razon: 'invalida'; readonly motivo: string };

export type ResultadoOrden =
  | { readonly ok: true; readonly categorias: readonly Categoria[] }
  | { readonly ok: false; readonly razon: 'no-coincide' };

export type ResultadoBorrarCategoria =
  | { readonly ok: true }
  | { readonly ok: false; readonly razon: 'inexistente' | 'con-casos' };

/** El nombre ya recortado, o el motivo por el que no sirve (CAS2). */
function validarNombre(nombre: string): { readonly nombre: string } | { readonly motivo: string } {
  const recortado = nombre.trim();
  if (recortado.length === 0) return { motivo: 'el nombre de la categoría está vacío' };
  if (recortado.length > MAX_CARACTERES_CATEGORIA) return { motivo: `el nombre de la categoría supera ${String(MAX_CARACTERES_CATEGORIA)} caracteres` };
  return { nombre: recortado };
}

/**
 * Crea, renombra, ordena y borra las categorías de casos (CAS2): el nombre es único sin distinguir mayúsculas ni acentos (CAS1,
 * lo impone la base), una categoría con casos no se borra y reordenar exige la lista completa. Cada escritura sube la versión
 * compartida para que el siguiente mensaje del bot vea el cambio (CAS7).
 */
@Injectable()
export class AdministrarCategorias {
  private readonly logger = new Logger(AdministrarCategorias.name);

  constructor(
    @Inject(REPOSITORIO_ADMINISTRACION) private readonly repositorio: RepositorioAdministracion,
    @Inject(VERSION_ASISTENTE) private readonly version: VersionAsistente,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  listar(): Promise<readonly Categoria[]> {
    return this.repositorio.listarCategorias();
  }

  async crear(nombre: string): Promise<ResultadoCategoria> {
    const validado = validarNombre(nombre);
    if ('motivo' in validado) return { ok: false, razon: 'invalida', motivo: validado.motivo };
    const resultado = await this.repositorio.crearCategoria(validado.nombre, normalizarNombre(validado.nombre), this.clock.ahora());
    if (resultado === 'duplicada') return { ok: false, razon: 'duplicada' };
    await subirVersion(this.version, this.logger);
    return { ok: true, categoria: resultado };
  }

  async renombrar(id: string, nombre: string): Promise<ResultadoCategoria> {
    const validado = validarNombre(nombre);
    if ('motivo' in validado) return { ok: false, razon: 'invalida', motivo: validado.motivo };
    const resultado = await this.repositorio.renombrarCategoria(id, validado.nombre, normalizarNombre(validado.nombre), this.clock.ahora());
    if (resultado === 'inexistente' || resultado === 'duplicada') return { ok: false, razon: resultado };
    await subirVersion(this.version, this.logger);
    return { ok: true, categoria: resultado };
  }

  async ordenar(ids: readonly string[]): Promise<ResultadoOrden> {
    const resultado = await this.repositorio.ordenarCategorias(ids, this.clock.ahora());
    if (resultado === 'no-coincide') return { ok: false, razon: 'no-coincide' };
    await subirVersion(this.version, this.logger);
    return { ok: true, categorias: resultado };
  }

  async borrar(id: string): Promise<ResultadoBorrarCategoria> {
    const resultado = await this.repositorio.borrarCategoria(id);
    if (resultado !== 'borrada') return { ok: false, razon: resultado };
    await subirVersion(this.version, this.logger);
    return { ok: true };
  }
}
