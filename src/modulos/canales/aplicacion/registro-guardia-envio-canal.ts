import { Injectable } from '@nestjs/common';
import type { GuardiaEnvioCanal } from '../puertos/guardia-envio-canal.js';

/**
 * Registro de la guardia de envío (CAN9, D7 de la 07a), mismo patrón que
 * `RegistroConsumidorEventosCanal`: la dependencia va de `conversaciones` hacia `canales`, que no
 * importa al módulo de negocio. Sin guardia registrada, {@link obtener} devuelve `undefined` y el
 * publicador envía como en las Fases 04 y 05.
 */
@Injectable()
export class RegistroGuardiaEnvioCanal {
  private guardia: GuardiaEnvioCanal | undefined;

  registrar(guardia: GuardiaEnvioCanal): void {
    if (this.guardia !== undefined && this.guardia !== guardia) {
      throw new Error('Ya hay una guardia de envío registrada; dos módulos no pueden disputarse el envío (CAN9).');
    }
    this.guardia = guardia;
  }

  obtener(): GuardiaEnvioCanal | undefined {
    return this.guardia;
  }
}
