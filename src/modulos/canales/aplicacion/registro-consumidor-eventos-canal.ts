import { Inject, Injectable } from '@nestjs/common';
import {
  CONSUMIDOR_EVENTOS_CANAL,
  type ConsumidorEventosCanal,
} from '../puertos/consumidor-eventos-canal.js';

/**
 * Registro de un único consumidor real de eventos de canal (D8 de `design.md`). `canales.module.ts`
 * provee `ConsumidorRegistrador` bajo el token {@link CONSUMIDOR_EVENTOS_CANAL} como consumidor
 * "de por defecto"; mientras nadie llame {@link registrar}, {@link obtener} devuelve ese consumidor.
 * La Fase 05 hará que `conversaciones` importe `CanalesModule` y llame `registrar` en su
 * `onModuleInit` (D8: la dependencia va en un solo sentido, `conversaciones → canales`, sin
 * `forwardRef` ni ciclo). Una segunda llamada con un consumidor distinto del ya registrado es un
 * error de programación: dos módulos de negocio no pueden disputarse el mismo evento.
 */
@Injectable()
export class RegistroConsumidorEventosCanal {
  private consumidorPropio: ConsumidorEventosCanal | undefined;

  constructor(
    @Inject(CONSUMIDOR_EVENTOS_CANAL) private readonly porDefecto: ConsumidorEventosCanal,
  ) {}

  registrar(consumidor: ConsumidorEventosCanal): void {
    if (this.consumidorPropio !== undefined && this.consumidorPropio !== consumidor) {
      throw new Error(
        'Ya hay un consumidor de eventos de canal registrado; dos módulos no pueden competir por el mismo evento (D8).',
      );
    }
    this.consumidorPropio = consumidor;
  }

  obtener(): ConsumidorEventosCanal {
    return this.consumidorPropio ?? this.porDefecto;
  }
}
