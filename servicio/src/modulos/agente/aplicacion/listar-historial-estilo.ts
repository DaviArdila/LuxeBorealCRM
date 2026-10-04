import { Inject, Injectable } from '@nestjs/common';
import {
  REPOSITORIO_ESTILO,
  type EstiloGuardado,
  type RepositorioEstilo,
  type VersionHistorial,
} from '../puertos/repositorio-estilo.js';

export interface EstiloConHistorial {
  /** `null` si nunca se publicó nada y rige el archivo de respaldo. */
  readonly vigente: EstiloGuardado | null;
  readonly historial: readonly VersionHistorial[];
}

/** El estilo vigente publicado y sus versiones retiradas, la más reciente primero (AGT21, AGT22). */
@Injectable()
export class ListarHistorialEstilo {
  constructor(@Inject(REPOSITORIO_ESTILO) private readonly repositorio: RepositorioEstilo) {}

  async ejecutar(): Promise<EstiloConHistorial> {
    const [vigente, historial] = await Promise.all([this.repositorio.leerVigente(), this.repositorio.leerHistorial()]);
    return { vigente, historial };
  }
}
