import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { respuestaDesdeZod } from '../../../plataforma/documentacion/index.js';
import { Publico, SinCsrf } from '../../usuarios/index.js';
import { RegistrarEventoEntrante } from '../aplicacion/registrar-evento-entrante.js';
import { traducirEvento } from '../infraestructura/chatwoot/traducir-evento.js';
import { GuardiaFirmaChatwoot } from './guardia-firma-chatwoot.js';
import {
  esquemaCuerpoWebhookChatwoot,
  esquemaRespuestaWebhookChatwoot,
  type CuerpoWebhookChatwoot,
  type RespuestaWebhookChatwoot,
} from './esquemas.js';

/** Único origen de este controlador (D4): otro proveedor de canal sería otra ruta/adaptador. */
const ORIGEN_CHATWOOT = 'chatwoot';

function primeraCabecera(valor: string | readonly string[] | undefined): string | undefined {
  if (typeof valor === 'string') return valor;
  return valor?.[0];
}

/**
 * `POST /api/v1/webhooks/chatwoot` (D2-D5, D16 de `design.md`; CAN1-CAN3, CAN5, R3, R4). Etiquetado
 * `internal` (API8): es infraestructura entre servicios, no algo que el back office invoque. La
 * guardia de firma corre antes que este método (D3); aquí solo queda traducir el evento por lista
 * blanca (D4) y, si se reconoce, registrarlo en el inbox (D5). Un tipo desconocido responde
 * `'ignorado'` sin tocar `evento_entrante` (CAN3) — este controlador nunca llama a
 * `RegistrarEventoEntrante` en ese caso. `@Publico()` y `@SinCsrf()` (Fase 11a, USR6/USR7): no usa la cookie de
 * sesión; su única puerta es la firma (R3).
 */
@Controller('webhooks/chatwoot')
export class WebhookChatwootController {
  constructor(private readonly registrarEventoEntrante: RegistrarEventoEntrante) {}

  @Post()
  @Publico()
  @SinCsrf()
  @UseGuards(GuardiaFirmaChatwoot)
  @ApiTags('internal')
  @ApiOperation({ operationId: 'recibirWebhookChatwoot', security: [] })
  @respuestaDesdeZod(esquemaRespuestaWebhookChatwoot, {
    description: 'Estado del evento recibido: registrado, duplicado o ignorado.',
  })
  async recibir(
    @Body({ schema: esquemaCuerpoWebhookChatwoot }) cuerpo: CuerpoWebhookChatwoot,
    @Headers() cabeceras: Readonly<Record<string, string | readonly string[] | undefined>>,
  ): Promise<RespuestaWebhookChatwoot> {
    const traducido = traducirEvento(cuerpo, {
      xChatwootDelivery: primeraCabecera(cabeceras['x-chatwoot-delivery']),
      xChatwootTimestamp: primeraCabecera(cabeceras['x-chatwoot-timestamp']),
    });

    if (!traducido.reconocido) {
      return { estado: 'ignorado' };
    }

    const estado = await this.registrarEventoEntrante.ejecutar({
      origen: ORIGEN_CHATWOOT,
      idExterno: traducido.idExterno,
      payload: traducido.evento,
    });

    return { estado };
  }
}
