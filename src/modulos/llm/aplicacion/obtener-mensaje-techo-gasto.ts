import { Inject, Injectable } from '@nestjs/common';
import {
  REPOSITORIO_PARAMETRO_LLM,
  type RepositorioParametroLlm,
} from '../puertos/repositorio-parametro-llm.js';

/**
 * Texto que ve el cliente cuando el techo de gasto pasa la conversación a un asesor (LLM9, R15).
 * Caso de uso exportado por `llm` para que `agente` lo lea sin conocer el repositorio de `parametro`;
 * nunca lanza por «no configurado»: el repositorio cae al texto por defecto.
 */
@Injectable()
export class ObtenerMensajeTechoGasto {
  constructor(
    @Inject(REPOSITORIO_PARAMETRO_LLM) private readonly parametros: RepositorioParametroLlm,
  ) {}

  ejecutar(): Promise<string> {
    return this.parametros.obtenerMensajeTechoGasto();
  }
}
