import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { GENERADOR_RESPUESTA } from '../conversaciones/index.js';
import { HorarioModule } from '../horario/index.js';
import { MotorTurno } from './aplicacion/motor-turno.js';
import { ContenidoEcoProvisional } from './aplicacion/politicas/contenido-eco-provisional.js';
import { PoliticaNoTextuales } from './aplicacion/politicas/politica-no-textuales.js';
import { PoliticaTopeTurnos } from './aplicacion/politicas/politica-tope-turnos.js';
import { TextoHandoff } from './aplicacion/texto-handoff.js';
import { POLITICAS_TURNO } from './dominio/politica-turno.js';
import { RepositorioParametroAgentePrisma } from './infraestructura/prisma/repositorio-parametro-agente-prisma.js';
import { ContadoresSesionRedis } from './infraestructura/redis/contadores-sesion-redis.js';
import { CONTADORES_SESION } from './puertos/contadores-sesion.js';
import { REPOSITORIO_PARAMETRO_AGENTE } from './puertos/repositorio-parametro-agente.js';

/**
 * Módulo del agente (Fase 07a, ADR-0016): implementa el puerto `GENERADOR_RESPUESTA` que define
 * `conversaciones` y lo exporta para que `AppModule` lo componga con
 * `ConversacionesModule.conGenerador(AgenteModule)`. Nunca importa `canales` (regla 13): pide
 * pasos y handoff, y `conversaciones` los ejecuta.
 *
 * El orden de `POLITICAS_TURNO` es el del pipeline (AGT1): mensajes no textuales (R12), tope de
 * turnos (R13) y, al final, el contenido provisional. `HorarioModule` aporta `HORARIO` para elegir
 * el texto de handoff (AGT3); el motor aplica el aviso de datos y registra el turno (AGT2, D8).
 */
@Module({
  imports: [PrismaModule, RedisModule, HorarioModule],
  providers: [
    { provide: CONTADORES_SESION, useClass: ContadoresSesionRedis },
    { provide: REPOSITORIO_PARAMETRO_AGENTE, useClass: RepositorioParametroAgentePrisma },
    TextoHandoff,
    PoliticaNoTextuales,
    PoliticaTopeTurnos,
    ContenidoEcoProvisional,
    {
      provide: POLITICAS_TURNO,
      useFactory: (
        noTextuales: PoliticaNoTextuales,
        tope: PoliticaTopeTurnos,
        contenido: ContenidoEcoProvisional,
      ) => [noTextuales, tope, contenido],
      inject: [PoliticaNoTextuales, PoliticaTopeTurnos, ContenidoEcoProvisional],
    },
    { provide: GENERADOR_RESPUESTA, useClass: MotorTurno },
  ],
  exports: [GENERADOR_RESPUESTA],
})
export class AgenteModule {}
