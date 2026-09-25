import { Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Exención de `GET /health` frente a `application/problem+json` (D6): un filtro de **controlador**
 * tiene precedencia sobre el filtro global (`FiltroProblemJson`), así que basta con reproducir el
 * comportamiento por defecto de Nest — el mismo que aplicaría Terminus sin ningún filtro global —
 * sin sobrescribir ningún método. `@Catch()` sin argumentos lo deja como catch-all, igual que
 * `BaseExceptionFilter` (que tampoco declara tipos). No compara rutas por cadena (alternativa que
 * D6 descarta explícitamente): la exención queda escrita en el propio controlador de `/health`.
 */
@Catch()
export class FiltroSaludOperativo extends BaseExceptionFilter {}
