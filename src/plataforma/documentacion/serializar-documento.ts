import type { OpenAPIObject } from '@nestjs/swagger';

/** JSON con dos espacios de indentación, un salto LF final y sin traducción dependiente del SO. */
export function serializarDocumento(documento: OpenAPIObject): string {
  return `${JSON.stringify(documento, null, 2)}\n`;
}
