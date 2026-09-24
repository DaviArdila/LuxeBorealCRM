import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, Injectable } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { construirProblema, type DetalleCampo } from './construir-problema.js';
import type { CodigoError } from './catalogo-codigos.js';
import { ErrorDeAplicacion } from './error-de-aplicacion.js';

interface SolicitudHttp {
  readonly url?: string;
  readonly id?: string | number;
}

interface RespuestaHttp {
  status(codigo: number): this;
  type(tipo: string): this;
  json(cuerpo: unknown): void;
}

/**
 * Filtro global de errores (D5, registrado como `APP_FILTER` en `ErroresModule`). Traduce
 * {@link ErrorDeAplicacion} y cualquier excepción no manejada al formato RFC 9457
 * (`application/problem+json`).
 *
 * Cualquier otra `HttpException` (p. ej. la que lanza Terminus en `GET /health`, PLT4) se reenvía
 * sin cambios al comportamiento por defecto de Nest, delegando por composición en
 * `BaseExceptionFilter` (nunca extendiéndola: la firma pública de este filtro es `implements
 * ExceptionFilter`, design.md "Interfaces/Contracts"). La exención explícita de `/health` (D6) la
 * implementa T4 con un filtro de controlador (`FiltroSaludOperativo`) que tiene precedencia sobre
 * este global; hasta entonces, esta delegación por tipo evita romper `/health` — sin comparar
 * rutas por string, que es la alternativa que D6 descarta explícitamente para la exención final.
 */
@Catch()
@Injectable()
export class FiltroProblemJson implements ExceptionFilter {
  private comportamientoPorDefecto: BaseExceptionFilter | undefined;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @InjectPinoLogger(FiltroProblemJson.name) private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof ErrorDeAplicacion) {
      this.responderProblema(exception.codigo, host, exception.errores);
      return;
    }

    if (exception instanceof HttpException) {
      // `HttpAdapterHost.httpAdapter` no queda listo hasta que Nest crea la aplicación HTTP
      // (`createNestApplication`); `Test.createTestingModule().compile()` instancia los
      // providers ANTES de ese punto, así que este delegado se construye perezoso, en el
      // primer `catch()` real (siempre después de `app.init()`), nunca en el constructor.
      this.comportamientoPorDefecto ??= new BaseExceptionFilter(this.adapterHost.httpAdapter);
      this.comportamientoPorDefecto.catch(exception, host);
      return;
    }

    const solicitud = host.switchToHttp().getRequest<SolicitudHttp>();
    // D5: solo los errores no manejados registran `err` (sujeto a la redacción de D9 de 00a);
    // nunca se crea un campo nuevo sin redactar para el diagnóstico, y el cliente nunca recibe
    // el mensaje ni el stack de la excepción (construirProblema no los toca).
    this.logger.error(
      { err: exception, codigo: 'error-interno' satisfies CodigoError, reqId: solicitud.id },
      'Excepción no manejada',
    );
    this.responderProblema('error-interno', host);
  }

  private responderProblema(
    codigo: CodigoError,
    host: ArgumentsHost,
    errores?: readonly DetalleCampo[],
  ): void {
    const http = host.switchToHttp();
    const solicitud = http.getRequest<SolicitudHttp>();
    const respuesta = http.getResponse<RespuestaHttp>();
    const problema = construirProblema(codigo, { instance: solicitud.url, errores });

    respuesta.status(problema.status).type('application/problem+json').json(problema);
  }
}
