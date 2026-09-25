import type { INestApplication } from '@nestjs/common';
import { apiReference } from '@scalar/nestjs-api-reference';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { construirDocumentoInterno } from './construir-documento.js';
import { filtrarDocumentoPublico } from './filtrar-documento-publico.js';

/**
 * Monta Scalar en `/docs` (D7, API9), sobre el documento **público** (D1): nunca el interno, que
 * llevaría operaciones `internal` a un endpoint sin protección de autenticación (Fase 11).
 *
 * No-op si `DOCS_HABILITADO` es falso (default): `/docs` responde el `404` propio de Nest sin que
 * este módulo construya el documento ni monte nada — el arranque de producción no paga nada por
 * esta pieza (D7). `cargarConfiguracion` (PLT1) ya rechaza `NODE_ENV=production` combinado con
 * `DOCS_HABILITADO=true` antes de llegar aquí, así que esta función no repite esa validación.
 */
export function montarDocumentacion(app: INestApplication): void {
  const configuracion = app.get<Configuracion>(CONFIGURACION);
  if (!configuracion.DOCS_HABILITADO) {
    return;
  }

  const documentoPublico = filtrarDocumentoPublico(construirDocumentoInterno(app));
  app.use('/docs', apiReference({ content: documentoPublico }));
}
