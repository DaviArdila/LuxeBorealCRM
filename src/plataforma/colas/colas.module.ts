import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { opcionesConexionColas } from './opciones-conexion.js';

/**
 * Raíz de BullMQ sobre el mismo Redis de plataforma (`REDIS_URL`), con conexión y configuración
 * propias de BullMQ (D6 de `design.md`): `plataforma/redis` sirve al *health check* (falla
 * rápido); BullMQ exige `maxRetriesPerRequest: null` para sus *workers*, lo contrario de lo que
 * necesita ese cliente. Cada dueño registra su propia cola con `BullModule.registerQueue`
 * (`canales` → `canales-inbox`, T4; `plataforma/outbox` → `outbox`, T6); este módulo solo fija la
 * configuración compartida una vez, en la raíz (`AppModule`).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [CONFIGURACION],
      useFactory: (configuracion: Configuracion) => ({
        connection: opcionesConexionColas(configuracion.REDIS_URL),
        prefix: configuracion.COLAS_PREFIJO,
      }),
    }),
  ],
})
export class ColasModule {}
