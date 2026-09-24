import type { INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { CONFIGURACION_DOCUMENTO } from './configuracion-documento.js';

/** Construye el documento completo desde una app ya inicializada. */
export function construirDocumentoInterno(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, CONFIGURACION_DOCUMENTO, {
    // El prefijo configurado en la app forma parte del contrato; se fija explícitamente por API2.
    ignoreGlobalPrefix: false,
  });
}
