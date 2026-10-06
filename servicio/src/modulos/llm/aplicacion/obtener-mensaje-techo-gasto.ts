import { Inject, Injectable } from '@nestjs/common';
import { TEXTOS_ASISTENTE, type TextosAsistente } from '../../asistente/index.js';

/**
 * Texto que ve el cliente cuando el techo de gasto pasa la conversación a un asesor (LLM9, R15): el caso
 * `mensaje_techo_gasto` del asistente. Caso de uso exportado por `llm` para que `agente` lo lea sin conocer de dónde sale;
 * nunca lanza por «no configurado»: el puerto de textos cae al texto de respaldo.
 */
@Injectable()
export class ObtenerMensajeTechoGasto {
  constructor(@Inject(TEXTOS_ASISTENTE) private readonly textos: TextosAsistente) {}

  ejecutar(): Promise<string> {
    return this.textos.textoDelSistema('mensaje_techo_gasto');
  }
}
