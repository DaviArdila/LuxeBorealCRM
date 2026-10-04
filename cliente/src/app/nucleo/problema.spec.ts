import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { leerProblema } from './problema';

describe('D11 — leerProblema devuelve código, título y motivo de un problem+json', () => {
  it('lee los campos de RFC 9457 del cuerpo de la respuesta', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { codigo: 'mensaje-fijo-invalido', title: 'Mensaje inválido', detail: 'El texto está en blanco' },
    });

    expect(leerProblema(error)).toEqual({
      estado: 422,
      codigo: 'mensaje-fijo-invalido',
      titulo: 'Mensaje inválido',
      motivo: 'El texto está en blanco',
      esperarSegundos: undefined,
    });
  });

  it('lee Retry-After en segundos de un 429', () => {
    const error = new HttpErrorResponse({
      status: 429,
      headers: new HttpHeaders({ 'Retry-After': '600' }),
      error: { codigo: 'demasiados-intentos', title: 'Demasiados intentos' },
    });

    expect(leerProblema(error).esperarSegundos).toBe(600);
  });

  it('sin cuerpo de problema devuelve un código genérico con el estado', () => {
    const error = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });

    expect(leerProblema(error)).toMatchObject({ estado: 0, codigo: 'desconocido' });
  });

  it('un error que no es de HTTP también devuelve el genérico', () => {
    expect(leerProblema(new Error('boom'))).toMatchObject({ estado: 0, codigo: 'desconocido' });
  });
});
