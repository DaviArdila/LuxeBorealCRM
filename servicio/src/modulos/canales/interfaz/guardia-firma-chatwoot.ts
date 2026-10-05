import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { verificarFirmaChatwoot } from '../infraestructura/chatwoot/verificar-firma.js';

/**
 * Forma mínima de la petición que la guardia necesita, declarada localmente en vez de importar
 * tipos de `express` (mismo criterio que `SolicitudHttp` de `FiltroProblemJson`, D5 de 00b): evita
 * depender del paquete `express` directamente (`@nestjs/platform-express` ya lo trae transitivo,
 * pero no es una dependencia declarada de este módulo). `rawBody` lo llena Nest cuando la app se
 * crea con `OPCIONES_APLICACION` (`rawBody: true`, D2); las cabeceras llegan siempre en minúsculas
 * (Express las normaliza).
 */
interface SolicitudConCuerpoCrudo {
  readonly rawBody?: Buffer;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

function primeraCabecera(valor: string | readonly string[] | undefined): string | undefined {
  if (typeof valor === 'string') return valor;
  return valor?.[0];
}

/**
 * Guardia de firma del webhook de Chatwoot (D3, R3, CAN2): corre antes de cualquier pipe,
 * interceptor o handler (orden nativo de NestJS), así que ningún evento sin firma válida llega a
 * `traducirEvento` ni a `RegistrarEventoEntrante`. Delega toda la lógica de verificación en la
 * función pura `verificarFirmaChatwoot` (T2); esta clase solo arma sus parámetros desde la
 * petición HTTP real y traduce `false` a `ErrorDeAplicacion('firma-invalida')`, que
 * `FiltroProblemJson` (D5 de 00b) responde como `401 application/problem+json`.
 */
@Injectable()
export class GuardiaFirmaChatwoot implements CanActivate {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConCuerpoCrudo>();

    const valido = verificarFirmaChatwoot({
      rawBody: solicitud.rawBody ?? Buffer.alloc(0),
      firmaHeader: primeraCabecera(solicitud.headers['x-chatwoot-signature']),
      timestampHeader: primeraCabecera(solicitud.headers['x-chatwoot-timestamp']),
      secreto: this.configuracion.CHATWOOT_WEBHOOK_SECRETO,
      toleranciaSegundos: this.configuracion.CHATWOOT_WEBHOOK_TOLERANCIA_S,
      ahoraSegundos: Math.floor(this.clock.ahora().getTime() / 1000),
    });

    if (!valido) {
      throw new ErrorDeAplicacion('firma-invalida');
    }

    return true;
  }
}
