import { BullModule } from '@nestjs/bullmq';
import { Inject, Module, type DynamicModule, type OnModuleInit, type Type } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { AsistenteModule } from '../asistente/index.js';
import { CanalesModule, RegistroConsumidorEventosCanal, RegistroGuardiaEnvioCanal } from '../canales/index.js';
import { AgenteEco } from './aplicacion/agente-eco.js';
import { ConsumidorConversaciones } from './aplicacion/consumidor-conversaciones.js';
import { EnviarRespuestaTurno } from './aplicacion/enviar-respuesta-turno.js';
import { GuardiaEnvioConversaciones } from './aplicacion/guardia-envio-conversaciones.js';
import { ProcesarEsperasClientes } from './aplicacion/procesar-esperas-clientes.js';
import { ProcesarTurno } from './aplicacion/procesar-turno.js';
import { ObservadoresHandoffModule } from './observadores-handoff.module.js';
import { TransicionarConversacion } from './aplicacion/transicionar-conversacion.js';
import {
  BarridoVencimientos,
  NOMBRE_COLA_BARRIDO_VENCIMIENTOS,
} from './infraestructura/colas/barrido-vencimientos.js';
import { BarridoEsperas, NOMBRE_COLA_BARRIDO_ESPERAS } from './infraestructura/colas/barrido-esperas.js';
import { ColaTurno, NOMBRE_COLA_TURNO } from './infraestructura/colas/cola-turno.js';
import { RepositorioConversacionPrisma } from './infraestructura/prisma/repositorio-conversacion-prisma.js';
import { BufferTurno } from './infraestructura/redis/buffer-turno.js';
import { ContadorRateLimit } from './infraestructura/redis/contador-rate-limit.js';
import { InterruptorGlobalRedis } from './infraestructura/redis/interruptor-global-redis.js';
import { LockTurno } from './infraestructura/redis/lock-turno.js';
import { MarcaEsperaClienteRedis } from './infraestructura/redis/marca-espera-cliente-redis.js';
import { MarcaEsperaHandoff } from './infraestructura/redis/marca-espera-handoff.js';
import { MarcaMensajeProcesado } from './infraestructura/redis/marca-mensaje-procesado.js';
import { GENERADOR_RESPUESTA } from './puertos/generador-respuesta.js';
import { INTERRUPTOR_GLOBAL } from './puertos/interruptor-global.js';
import { MARCA_ESPERA_CLIENTE } from './puertos/marca-espera-cliente.js';
import { REPOSITORIO_CONVERSACION } from './puertos/repositorio-conversacion.js';
import { ENVIAR_RESPUESTA_TURNO } from './puertos/salida-conversacion.js';

const IMPORTS = [
  PrismaModule,
  RedisModule,
  AsistenteModule,
  CanalesModule,
  BullModule.registerQueue({ name: NOMBRE_COLA_TURNO }),
  BullModule.registerQueue({ name: NOMBRE_COLA_BARRIDO_VENCIMIENTOS }),
  BullModule.registerQueue({ name: NOMBRE_COLA_BARRIDO_ESPERAS }),
  ObservadoresHandoffModule,
];

// Todo menos el generador: `ConversacionesModule` le suma `AgenteEco` y `conGenerador` el que le pasen.
const PROVIDERS = [
  { provide: REPOSITORIO_CONVERSACION, useClass: RepositorioConversacionPrisma },
  { provide: MARCA_ESPERA_CLIENTE, useClass: MarcaEsperaClienteRedis },
  { provide: INTERRUPTOR_GLOBAL, useClass: InterruptorGlobalRedis },
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
  GuardiaEnvioConversaciones,
  BarridoVencimientos,
  ProcesarEsperasClientes,
  BarridoEsperas,
];

/** Arranque común de las dos variantes del módulo: registra el consumidor y la guardia en `canales`. */
// Sin `@Injectable()`: Nest lo heredaría en los módulos y rechazaría su uso en `imports`.
class ConversacionesBase implements OnModuleInit {
  constructor(
    @Inject(RegistroConsumidorEventosCanal) private readonly registro: RegistroConsumidorEventosCanal,
    @Inject(ConsumidorConversaciones) private readonly consumidorConversaciones: ConsumidorConversaciones,
    @Inject(RegistroGuardiaEnvioCanal) private readonly registroGuardia: RegistroGuardiaEnvioCanal,
    @Inject(GuardiaEnvioConversaciones) private readonly guardiaEnvio: GuardiaEnvioConversaciones,
  ) {}

  onModuleInit(): void {
    this.registro.registrar(this.consumidorConversaciones);
    this.registroGuardia.registrar(this.guardiaEnvio); // CNV9: releer el estado antes de cada paso
  }
}

/**
 * Variante que devuelve `conGenerador`: mismo cableado, sin `AgenteEco`. Es una clase aparte porque
 * un `DynamicModule` sobre la clase estática hereda sus `providers` y no habría cómo quitar el eco;
 * los metadatos propios (vacíos) cortan la herencia del decorador de `ConversacionesModule`.
 */
@Module({ imports: [], providers: [], exports: [] })
class ConversacionesConGenerador extends ConversacionesBase {}

/**
 * Módulo de conversaciones (design.md D1, D15): máquina de estados bot/humano, debounce/lock/buffer
 * efímeros, el processor del turno y el barrido de vencimientos. Importa el barril de `canales`
 * (D8/D9/D16: `CONSUMIDOR_EVENTOS_CANAL`, `RegistroConsumidorEventosCanal`, `SALIDA_CANAL`,
 * `LECTOR_MENSAJE_CANAL`, `EventoCanal`) y es el único módulo, además de `canales`, que lo hace —
 * regla de fronteras nueva (T6): solo `modulos/conversaciones` importa `SALIDA_CANAL`.
 *
 * Estático, `GENERADOR_RESPUESTA` provee `AgenteEco` (D9), el *stand-in* de los tests del propio
 * módulo. La aplicación usa {@link ConversacionesModule.conGenerador} con el módulo `agente`
 * (ADR-0016): el puerto queda aquí y esta carpeta nunca importa al agente (regla 15).
 * `ENVIAR_RESPUESTA_TURNO` provee `EnviarRespuestaTurno` (D10, T6) — se registra ya en T5 porque
 * `ProcesarTurno` (T4) lo exige para que Nest resuelva el árbol de dependencias al arrancar
 * `AppModule`.
 */
@Module({
  imports: IMPORTS,
  providers: [...PROVIDERS, { provide: GENERADOR_RESPUESTA, useClass: AgenteEco }],
})
export class ConversacionesModule extends ConversacionesBase {
  /**
   * Compone el módulo con el que provee y exporta `GENERADOR_RESPUESTA` (ADR-0016, D4): el módulo
   * dinámico lo importa y no registra `AgenteEco`. Recibe la clase, no la importa (regla 15).
   */
  static conGenerador(moduloGenerador: Type<unknown>): DynamicModule {
    return { module: ConversacionesConGenerador, imports: [...IMPORTS, moduloGenerador], providers: PROVIDERS };
  }
}
