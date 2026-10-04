import { ApiResponse } from '@nestjs/swagger';

/**
 * Documenta una respuesta de error en `application/problem+json` (API4, API11; regla Spectral
 * `luxeboreal-errores-problem-json`). El esquema es el cuerpo RFC 9457 que responde `FiltroProblemJson` (`Problema` de
 * `plataforma/errores`, ADR-0011); va escrito aquí porque el filtro no valida su propia salida con zod. `errores` solo
 * aparece en `validacion-fallida` y `detail` (el motivo) solo en los errores de negocio que lo traen.
 */
export function respuestaProblema(status: number, description: string): MethodDecorator & ClassDecorator {
  return ApiResponse({
    status,
    description,
    content: {
      'application/problem+json': {
        schema: {
          type: 'object',
          required: ['type', 'title', 'status', 'codigo'],
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'integer' },
            codigo: { type: 'string' },
            instance: { type: 'string' },
            detail: { type: 'string' },
            errores: {
              type: 'array',
              items: {
                type: 'object',
                required: ['campo', 'problema'],
                properties: {
                  campo: { type: 'string' },
                  problema: { type: 'string', enum: ['falta', 'formato', 'valor'] },
                },
              },
            },
          },
        },
      },
    },
  });
}
