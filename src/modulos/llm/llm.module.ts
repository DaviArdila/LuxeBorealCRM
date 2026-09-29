import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { LlmGateway } from './aplicacion/llm-gateway.js';
import { AdaptadorOpenRouter } from './infraestructura/adaptador-openrouter.js';
import { RepositorioParametroLlmPrisma } from './infraestructura/prisma/repositorio-parametro-llm-prisma.js';
import { RepositorioUsoLlmPrisma } from './infraestructura/prisma/repositorio-uso-llm-prisma.js';
import { TemporizadorReal } from './infraestructura/temporizador-real.js';
import { ADAPTADOR_LLM } from './puertos/adaptador-llm.js';
import { LLM_PORT } from './puertos/llm-port.js';
import { REPOSITORIO_PARAMETRO_LLM } from './puertos/repositorio-parametro-llm.js';
import { REPOSITORIO_USO_LLM } from './puertos/repositorio-uso-llm.js';
import { TEMPORIZADOR_LLM } from './puertos/temporizador-llm.js';

/**
 * Módulo de la pasarela de LLM (ADR-0002): compone `LlmGateway` detrás de `LLM_PORT` con el adaptador
 * OpenRouter, los repositorios de `uso_llm` y `parametro` y el temporizador real. Solo exporta
 * `LLM_PORT`; el adaptador, los repositorios y el temporizador son internos. Todavía no se registra en
 * `AppModule` ni se conecta a `ProcesarTurno`: `GENERADOR_RESPUESTA` sigue en `AgenteEco` hasta que
 * la Fase 07 lo reemplace.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: LLM_PORT, useClass: LlmGateway },
    { provide: ADAPTADOR_LLM, useClass: AdaptadorOpenRouter },
    { provide: REPOSITORIO_USO_LLM, useClass: RepositorioUsoLlmPrisma },
    { provide: REPOSITORIO_PARAMETRO_LLM, useClass: RepositorioParametroLlmPrisma },
    { provide: TEMPORIZADOR_LLM, useClass: TemporizadorReal },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
