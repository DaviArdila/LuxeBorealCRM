import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { respuestaDesdeZod } from './respuesta-desde-zod.js';

const esquemaDePrueba = z.object({
  status: z.enum(['ok', 'error']),
  intentos: z.number().int(),
});

@Controller('prueba-respuesta-desde-zod')
class ControladorDePrueba {
  @Get()
  @respuestaDesdeZod(esquemaDePrueba, { description: 'Respuesta de prueba.' })
  obtener(): { status: 'ok' | 'error'; intentos: number } {
    return { status: 'ok', intentos: 0 };
  }
}

@Module({ controllers: [ControladorDePrueba] })
class ModuloDePrueba {}

/**
 * Checkpoint (c) de `tasks.md`: confirma empíricamente, generando un documento real con
 * `@nestjs/swagger@12`, que `respuestaDesdeZod` documenta la respuesta a partir del Standard
 * Schema de zod sin convertirlo antes con `z.toJSONSchema`.
 */
describe('respuestaDesdeZod — checkpoint (c)', () => {
  it('documenta la respuesta con el esquema zod, sin @ApiProperty manual', async () => {
    const modulo = await Test.createTestingModule({ imports: [ModuloDePrueba] }).compile();
    const app = modulo.createNestApplication();
    await app.init();

    try {
      const documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
      const operacion = documento.paths?.['/prueba-respuesta-desde-zod']?.get;
      const respuesta200 = operacion?.responses?.['200'] as
        | { readonly description?: string; readonly content?: Record<string, { readonly schema?: unknown }> }
        | undefined;
      const esquemaGenerado = respuesta200?.content?.['application/json']?.schema;

      expect(respuesta200?.description).toBe('Respuesta de prueba.');
      expect(esquemaGenerado).toMatchObject({
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'error'] },
          intentos: { type: 'integer' },
        },
      });
    } finally {
      await app.close();
    }
  });
});
