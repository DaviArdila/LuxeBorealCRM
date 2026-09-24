import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { esquemaCrearEjemplo, type CrearEjemplo, type Ejemplo } from './esquemas.js';

/** Fecha literal fija (no `new Date()`): la respuesta del fixture es determinista a propósito. */
const FECHA_DE_PRUEBA = '2024-01-01T00:00:00.000Z';

/**
 * Controlador *fixture* de `test/contrato/` (D3 de `design.md`): ejercita el pipeline de
 * validación y errores sin ampliar la superficie pública real. Nunca se importa desde `src/` —
 * la frontera `src-no-importa-test` (T1 de 00a) lo vuelve estructuralmente imposible.
 *
 * `obtenerEjemploInterno` ya lleva `@ApiTags('internal')` (D1) aunque el filtro que la usa para
 * excluirla del documento público todavía no exista (T3): la etiqueta se declara ahora, tal como
 * fija `tasks.md` para T2, para que T3 la consuma sin volver a tocar este archivo.
 */
@Controller('ejemplos')
export class ContratoFixtureController {
  @Get()
  @ApiOperation({ operationId: 'listarEjemplos' })
  listarEjemplos(): readonly Ejemplo[] {
    return [
      {
        id: randomUUID(),
        nombre: 'Ejemplo de contrato',
        precioCop: 15000,
        creadoEn: FECHA_DE_PRUEBA,
      },
    ];
  }

  @Post()
  @ApiOperation({ operationId: 'crearEjemplo' })
  crearEjemplo(@Body({ schema: esquemaCrearEjemplo }) cuerpo: CrearEjemplo): Ejemplo {
    return {
      id: randomUUID(),
      nombre: cuerpo.nombre,
      precioCop: cuerpo.precioCop,
      creadoEn: FECHA_DE_PRUEBA,
    };
  }

  @Get('falla')
  @ApiOperation({ operationId: 'fallarEjemplo' })
  fallarEjemplo(): never {
    throw new Error('Fallo deliberado del fixture de contrato (D3): diagnóstico interno secreto');
  }

  @Get('interno')
  @ApiTags('internal')
  @ApiOperation({ operationId: 'obtenerEjemploInterno' })
  obtenerEjemploInterno(): { readonly disponible: true } {
    return { disponible: true };
  }
}
