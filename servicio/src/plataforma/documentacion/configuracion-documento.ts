import { createRequire } from 'node:module';
import { DocumentBuilder } from '@nestjs/swagger';

const require = createRequire(import.meta.url);
const metadatosPaquete = require('../../../package.json') as { readonly version: string };

/** Configuración literal: ningún valor depende del entorno, el momento ni la máquina. */
export const CONFIGURACION_DOCUMENTO = new DocumentBuilder()
  .setTitle('LuxeBorealCRM API')
  .setDescription('Contrato HTTP generado desde los controladores de la aplicación.')
  .setVersion(metadatosPaquete.version)
  .setOpenAPIVersion('3.1.0')
  .addServer('/')
  .addTag('internal', 'Operaciones internas no destinadas al cliente de back office.')
  // API11 (Fase 11a): sesión por cookie httpOnly; cada operación protegida lo aplica con `@ApiCookieAuth`.
  .addCookieAuth('luxe_sesion', { type: 'apiKey', in: 'cookie', name: 'luxe_sesion' }, 'cookieAuth')
  .build();
