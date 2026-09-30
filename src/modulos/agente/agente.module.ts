import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { GENERADOR_RESPUESTA } from '../conversaciones/index.js';
import { HorarioModule } from '../horario/index.js';
import { LlmModule } from '../llm/index.js';
import { BucleHerramientas } from './aplicacion/bucle-herramientas.js';
import { EnsamblarPrompt } from './aplicacion/ensamblar-prompt.js';
import { MotorTurno } from './aplicacion/motor-turno.js';
import { ContenidoLlm } from './aplicacion/politicas/contenido-llm.js';
import { PoliticaNoTextuales } from './aplicacion/politicas/politica-no-textuales.js';
import { PoliticaTopeTurnos } from './aplicacion/politicas/politica-tope-turnos.js';
import { RegistroHerramientas } from './aplicacion/registro-herramientas.js';
import { TextoHandoff } from './aplicacion/texto-handoff.js';
import { HERRAMIENTAS_AGENTE, type Herramienta } from './dominio/herramienta.js';
import { POLITICAS_TURNO } from './dominio/politica-turno.js';
import { RepositorioParametroAgentePrisma } from './infraestructura/prisma/repositorio-parametro-agente-prisma.js';
import { ContadoresSesionRedis } from './infraestructura/redis/contadores-sesion-redis.js';
import { CONTADORES_SESION } from './puertos/contadores-sesion.js';
import { REPOSITORIO_PARAMETRO_AGENTE } from './puertos/repositorio-parametro-agente.js';

/**
 * Módulo del agente (Fases 07a y 07b, ADR-0016): implementa el puerto `GENERADOR_RESPUESTA` que define
 * `conversaciones` y lo exporta para que `AppModule` lo componga con
 * `ConversacionesModule.conGenerador(AgenteModule)`. Nunca importa `canales` (regla 13): pide
 * pasos y handoff, y `conversaciones` los ejecuta.
 *
 * El orden de `POLITICAS_TURNO` es el del pipeline (AGT1): mensajes no textuales (R12), tope de
 * turnos (R13) y, al final, `ContenidoLlm` (Fase 07b): el bucle de herramientas sobre `LLM_PORT`. `HorarioModule` aporta `HORARIO` para elegir
 * el texto de handoff (AGT3); el motor aplica el aviso de datos y registra el turno (AGT2, D8).
 */
@Module({
  imports: [PrismaModule, RedisModule, HorarioModule, LlmModule],
  providers: [
    { provide: CONTADORES_SESION, useClass: ContadoresSesionRedis },
    { provide: REPOSITORIO_PARAMETRO_AGENTE, useClass: RepositorioParametroAgentePrisma },
    TextoHandoff,
    PoliticaNoTextuales,
    PoliticaTopeTurnos,
    EnsamblarPrompt,
    BucleHerramientas,
    ContenidoLlm,
    // Las herramientas reales se enchufan en T4-T7 de la Fase 07b; T7 fija `esperadas: 7` (R1).
    { provide: HERRAMIENTAS_AGENTE, useValue: [] as readonly Herramienta[] },
    {
      provide: RegistroHerramientas,
      useFactory: (herramientas: readonly Herramienta[]) => new RegistroHerramientas(herramientas),
      inject: [HERRAMIENTAS_AGENTE],
    },
    {
      provide: POLITICAS_TURNO,
      useFactory: (
        noTextuales: PoliticaNoTextuales,
        tope: PoliticaTopeTurnos,
        contenido: ContenidoLlm,
      ) => [noTextuales, tope, contenido],
      inject: [PoliticaNoTextuales, PoliticaTopeTurnos, ContenidoLlm],
    },
    { provide: GENERADOR_RESPUESTA, useClass: MotorTurno },
  ],
  exports: [GENERADOR_RESPUESTA],
})
export class AgenteModule {}
