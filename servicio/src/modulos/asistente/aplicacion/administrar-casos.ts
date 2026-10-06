import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { LIMITE_MAXIMO, LIMITE_POR_DEFECTO, type CasoAdmin, type PaginaCasos } from '../dominio/administracion.js';
import { codificarCursor, decodificarCursor } from '../dominio/cursor.js';
import { normalizarNombre } from '../dominio/normalizar.js';
import { validarCaso } from '../dominio/validar-caso.js';
import type { ModoCaso } from '../puertos/consulta-casos.js';
import { REPOSITORIO_ADMINISTRACION, type RepositorioAdministracion } from '../puertos/repositorio-administracion.js';
import { VERSION_ASISTENTE, type VersionAsistente } from '../puertos/version-asistente.js';
import { subirVersion } from './subir-version.js';

/** El cursor del listado no se pudo leer (API5): la interfaz lo traduce a un `400`. */
export class CursorInvalido extends Error {
  override readonly name = 'CursorInvalido';
}

/** Lo que un admin escribe al crear un caso de intención (CAS3). `claveSistema` solo existe para rechazarla (CAS4). */
export interface DatosCasoNuevoAdmin {
  readonly categoriaId: string;
  readonly titulo: string;
  readonly cuandoAplica: string;
  readonly texto: string;
  readonly modo?: ModoCaso;
  readonly activo?: boolean;
  readonly claveSistema?: string | null;
}

/** Lo que cambia una edición (CAS3): solo lo que viene; `actualizado` es la fecha que el admin leyó. */
export interface CambiosCaso {
  readonly actualizado: Date;
  readonly categoriaId?: string;
  readonly titulo?: string;
  readonly cuandoAplica?: string;
  readonly texto?: string;
  readonly modo?: ModoCaso;
  readonly activo?: boolean;
  readonly claveSistema?: string | null;
}

export interface FiltrosListado {
  readonly q?: string;
  readonly categoriaId?: string;
  readonly disparador?: 'evento' | 'intencion';
  readonly activo?: boolean;
  readonly cursor?: string;
  readonly limite?: number;
}

export type ResultadoCrearCaso =
  | { readonly ok: true; readonly caso: CasoAdmin }
  | { readonly ok: false; readonly razon: 'categoria-inexistente' | 'duplicado' }
  | { readonly ok: false; readonly razon: 'invalido'; readonly motivo: string };

export type ResultadoEditarCaso =
  | { readonly ok: true; readonly caso: CasoAdmin }
  | { readonly ok: false; readonly razon: 'inexistente' | 'modificado' | 'duplicado' | 'categoria-inexistente' | 'del-sistema' }
  | { readonly ok: false; readonly razon: 'invalido'; readonly motivo: string };

export type ResultadoBorrarCaso = { readonly ok: true } | { readonly ok: false; readonly razon: 'inexistente' | 'del-sistema' };

/**
 * Administra los casos del asistente (CAS3, CAS4, CAS5, CAS10): crea y edita casos de intención con su validación, edita (sin
 * borrar ni desactivar) los del sistema, protege las ediciones simultáneas con la fecha de actualización y lista con búsqueda,
 * filtros y cursor. Cada escritura sube la versión compartida (CAS7). Nunca escribe un texto en logs (R14).
 */
@Injectable()
export class AdministrarCasos {
  private readonly logger = new Logger(AdministrarCasos.name);

  constructor(
    @Inject(REPOSITORIO_ADMINISTRACION) private readonly repositorio: RepositorioAdministracion,
    @Inject(VERSION_ASISTENTE) private readonly version: VersionAsistente,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  obtener(id: string): Promise<CasoAdmin | null> {
    return this.repositorio.obtenerCaso(id);
  }

  async listar(filtros: FiltrosListado): Promise<PaginaCasos> {
    const despues = filtros.cursor === undefined ? null : decodificarCursor(filtros.cursor);
    if (filtros.cursor !== undefined && despues === null) throw new CursorInvalido('el cursor no es válido');
    const limite = Math.min(Math.max(filtros.limite ?? LIMITE_POR_DEFECTO, 1), LIMITE_MAXIMO);
    const q = filtros.q === undefined ? '' : normalizarNombre(filtros.q);
    const filas = await this.repositorio.listarCasos({
      qNormalizada: q.length === 0 ? null : q,
      categoriaId: filtros.categoriaId ?? null,
      disparador: filtros.disparador ?? null,
      activo: filtros.activo ?? null,
      despues,
      limite,
    });
    const items = filas.slice(0, limite);
    const ultimo = items.at(-1);
    return {
      items,
      siguienteCursor:
        filas.length > limite && ultimo !== undefined
          ? codificarCursor({ ordenCategoria: ultimo.categoriaOrden, tituloNormalizado: normalizarNombre(ultimo.titulo), id: ultimo.id })
          : null,
    };
  }

  async crear(datos: DatosCasoNuevoAdmin): Promise<ResultadoCrearCaso> {
    if (datos.claveSistema !== undefined && datos.claveSistema !== null) {
      return { ok: false, razon: 'invalido', motivo: 'los casos del sistema no se crean desde la API (CAS4)' };
    }
    const titulo = datos.titulo.trim();
    const cuandoAplica = datos.cuandoAplica.trim();
    const texto = datos.texto.trim();
    const modo = datos.modo ?? 'literal';
    const validacion = validarCaso({ titulo, cuandoAplica, texto, modo, disparador: 'intencion', claveSistema: null });
    if (!validacion.valido) return { ok: false, razon: 'invalido', motivo: validacion.motivo };

    const resultado = await this.repositorio.crearCaso(
      { categoriaId: datos.categoriaId, titulo, tituloNormalizado: normalizarNombre(titulo), cuandoAplica, texto, modo, activo: datos.activo ?? true },
      this.clock.ahora(),
    );
    if (typeof resultado === 'string') return { ok: false, razon: resultado };
    await subirVersion(this.version, this.logger);
    return { ok: true, caso: resultado };
  }

  async editar(id: string, cambios: CambiosCaso): Promise<ResultadoEditarCaso> {
    const actual = await this.repositorio.obtenerCaso(id);
    if (actual === null) return { ok: false, razon: 'inexistente' };
    if (cambios.claveSistema !== undefined && cambios.claveSistema !== actual.claveSistema) {
      return { ok: false, razon: 'invalido', motivo: 'la clave del sistema de un caso no se cambia desde la API (CAS4)' };
    }
    const titulo = (cambios.titulo ?? actual.titulo).trim();
    const cuandoAplica = (cambios.cuandoAplica ?? actual.cuandoAplica).trim();
    const texto = (cambios.texto ?? actual.texto).trim();
    const modo = cambios.modo ?? actual.modo;
    const activo = cambios.activo ?? actual.activo;
    if (actual.claveSistema !== null && !activo) return { ok: false, razon: 'del-sistema' };
    const validacion = validarCaso({ titulo, cuandoAplica, texto, modo, disparador: actual.disparador, claveSistema: actual.claveSistema });
    if (!validacion.valido) return { ok: false, razon: 'invalido', motivo: validacion.motivo };

    const resultado = await this.repositorio.editarCaso(
      id,
      { categoriaId: cambios.categoriaId ?? actual.categoriaId, titulo, tituloNormalizado: normalizarNombre(titulo), cuandoAplica, texto, modo, activo },
      cambios.actualizado,
      this.clock.ahora(),
    );
    if (typeof resultado === 'string') return { ok: false, razon: resultado };
    await subirVersion(this.version, this.logger);
    return { ok: true, caso: resultado };
  }

  async borrar(id: string): Promise<ResultadoBorrarCaso> {
    const resultado = await this.repositorio.borrarCaso(id);
    if (resultado !== 'borrado') return { ok: false, razon: resultado };
    await subirVersion(this.version, this.logger);
    return { ok: true };
  }
}
