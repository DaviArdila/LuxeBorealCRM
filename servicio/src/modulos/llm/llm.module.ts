import { Module } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../plataforma/config/index.js';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { AsistenteModule } from '../asistente/index.js';
import { LlmGateway } from './aplicacion/llm-gateway.js';
import { ObtenerMensajeTechoGasto } from './aplicacion/obtener-mensaje-techo-gasto.js';
import { AdaptadorEnrutador } from './infraestructura/adaptador-enrutador.js';
import { crearProveedoresUsados } from './infraestructura/fabrica-proveedores.js';
import { RepositorioParametroLlmPrisma } from './infraestructura/prisma/repositorio-parametro-llm-prisma.js';
import { RepositorioUsoLlmPrisma } from './infraestructura/prisma/repositorio-uso-llm-prisma.js';
import { TemporizadorReal } from './infraestructura/temporizador-real.js';
import { ADAPTADOR_LLM, type AdaptadorLlm } from './puertos/adaptador-llm.js';
import { LLM_PORT } from './puertos/llm-port.js';
import { REPOSITORIO_PARAMETRO_LLM } from './puertos/repositorio-parametro-llm.js';
import { REPOSITORIO_USO_LLM } from './puertos/repositorio-uso-llm.js';
import { TEMPORIZADOR_LLM } from './puertos/temporizador-llm.js';

/**
 * Módulo de la pasarela de LLM (ADR-0002): compone `LlmGateway` detrás de `LLM_PORT` con el enrutador
 * de proveedores (OpenRouter por defecto y los directos que un perfil use, ADR-0019), los repositorios de `uso_llm` y `parametro` y el temporizador real. Exporta
 * `LLM_PORT` y el caso de uso `ObtenerMensajeTechoGasto` (Fase 07b); el adaptador, los repositorios y
 * el temporizador son internos. `AgenteModule` lo importa y compone el bucle de herramientas encima.
 */
@Module({
  imports: [PrismaModule, AsistenteModule],
  providers: [
    { provide: LLM_PORT, useClass: LlmGateway },
    ObtenerMensajeTechoGasto,
    {
      provide: ADAPTADOR_LLM,
      inject: [CONFIGURACION],
      // Solo se construyen los proveedores que algún perfil usa (LLM17); el prefijo del modelo elige
      // a cuál va cada llamada (LLM15).
      useFactory: (configuracion: Configuracion): AdaptadorLlm =>
        new AdaptadorEnrutador(crearProveedoresUsados(configuracion)),
    },

    { provide: REPOSITORIO_USO_LLM, useClass: RepositorioUsoLlmPrisma },
    { provide: REPOSITORIO_PARAMETRO_LLM, useClass: RepositorioParametroLlmPrisma },
    { provide: TEMPORIZADOR_LLM, useClass: TemporizadorReal },
  ],
  exports: [LLM_PORT, ObtenerMensajeTechoGasto],
})
export class LlmModule {}
