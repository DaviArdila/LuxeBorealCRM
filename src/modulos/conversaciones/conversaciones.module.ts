import { BullModule } from '@nestjs/bullmq';
import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { CanalesModule, RegistroConsumidorEventosCanal } from '../canales/index.js';
import { AgenteEco } from './aplicacion/agente-eco.js';
import { ConsumidorConversaciones } from './aplicacion/consumidor-conversaciones.js';
import { EnviarRespuestaTurno } from './aplicacion/enviar-respuesta-turno.js';
import { ProcesarTurno } from './aplicacion/procesar-turno.js';
import { TransicionarConversacion } from './aplicacion/transicionar-conversacion.js';
import {
  BarridoVencimientos,
  NOMBRE_COLA_BARRIDO_VENCIMIENTOS,
} from './infraestructura/colas/barrido-vencimientos.js';
import { ColaTurno, NOMBRE_COLA_TURNO } from './infraestructura/colas/cola-turno.js';
import { RepositorioConversacionPrisma } from './infraestructura/prisma/repositorio-conversacion-prisma.js';
import { RepositorioParametroConversacionesPrisma } from './infraestructura/prisma/repositorio-parametro-conversaciones-prisma.js';
import { BufferTurno } from './infraestructura/redis/buffer-turno.js';
import { ContadorRateLimit } from './infraestructura/redis/contador-rate-limit.js';
import { InterruptorGlobalRedis } from './infraestructura/redis/interruptor-global-redis.js';
import { LockTurno } from './infraestructura/redis/lock-turno.js';
import { MarcaEsperaHandoff } from './infraestructura/redis/marca-espera-handoff.js';
import { MarcaMensajeProcesado } from './infraestructura/redis/marca-mensaje-procesado.js';
import { GENERADOR_RESPUESTA } from './puertos/generador-respuesta.js';
import { INTERRUPTOR_GLOBAL } from './puertos/interruptor-global.js';
import { REPOSITORIO_PARAMETRO_CONVERSACIONES } from './puertos/repositorio-parametro-conversaciones.js';
import { REPOSITORIO_CONVERSACION } from './puertos/repositorio-conversacion.js';
import { ENVIAR_RESPUESTA_TURNO } from './puertos/salida-conversacion.js';

/**
 * Módulo de conversaciones (design.md D1, D15): máquina de estados bot/humano, debounce/lock/buffer
 * efímeros, el processor del turno y el barrido de vencimientos. Importa el barril de `canales`
 * (D8/D9/D16: `CONSUMIDOR_EVENTOS_CANAL`, `RegistroConsumidorEventosCanal`, `SALIDA_CANAL`,
 * `LECTOR_MENSAJE_CANAL`, `EventoCanal`) y es el único módulo, además de `canales`, que lo hace —
 * regla de fronteras nueva (T6): solo `modulos/conversaciones` importa `SALIDA_CANAL`.
 *
 * `GENERADOR_RESPUESTA` provee `AgenteEco` (D9), el *stand-in* de esta fase; la Fase 07 cambia el
 * *binding* sin tocar `ProcesarTurno`. `ENVIAR_RESPUESTA_TURNO` provee `EnviarRespuestaTurno` (D10,
 * T6) — se registra ya en T5 porque `ProcesarTurno` (T4) lo exige para que Nest resuelva el árbol
 * de dependencias al arrancar `AppModule`; T6 solo le agrega la regla de fronteras y su test
 * dedicado, la clase ya existe.
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    CanalesModule,
    BullModule.registerQueue({ name: NOMBRE_COLA_TURNO }),
    BullModule.registerQueue({ name: NOMBRE_COLA_BARRIDO_VENCIMIENTOS }),
  ],
  providers: [
    { provide: REPOSITORIO_CONVERSACION, useClass: RepositorioConversacionPrisma },
    { provide: REPOSITORIO_PARAMETRO_CONVERSACIONES, useClass: RepositorioParametroConversacionesPrisma },
    { provide: INTERRUPTOR_GLOBAL, useClass: InterruptorGlobalRedis },
    { provide: GENERADOR_RESPUESTA, useClass: AgenteEco },
    { provide: ENVIAR_RESPUESTA_TURNO, useClass: EnviarRespuestaTurno },
    BufferTurno,
    LockTurno,
    ContadorRateLimit,
    MarcaEsperaHandoff,
    MarcaMensajeProcesado,
    ColaTurno,
    ProcesarTurno,
    TransicionarConversacion,
    ConsumidorConversaciones,
    BarridoVencimientos,
  ],
})
export class ConversacionesModule implements OnModuleInit {
  constructor(
    private readonly registro: RegistroConsumidorEventosCanal,
    private readonly consumidorConversaciones: ConsumidorConversaciones,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.consumidorConversaciones);
  }
}
