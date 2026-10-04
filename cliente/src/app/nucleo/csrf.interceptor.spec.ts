import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { csrfInterceptor } from './csrf.interceptor';

function preparar(): { http: HttpClient; control: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([csrfInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { http: TestBed.inject(HttpClient), control: TestBed.inject(HttpTestingController) };
}

describe('CLT6 — Toda mutación lleva el encabezado anti-CSRF', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('CLT6 — Una petición %s hacia /api lleva X-Luxe-Csrf: 1', (metodo) => {
    const { http, control } = preparar();

    http.request(metodo, '/api/v1/agente/estilo', { body: {} }).subscribe();

    const peticion = control.expectOne('/api/v1/agente/estilo');
    expect(peticion.request.headers.get('X-Luxe-Csrf')).toBe('1');
  });

  it('CLT6 — Una lectura no lleva el encabezado', () => {
    const { http, control } = preparar();

    http.get('/api/v1/agente/estilo').subscribe();

    expect(control.expectOne('/api/v1/agente/estilo').request.headers.has('X-Luxe-Csrf')).toBe(false);
  });

  it('CLT6 — Una mutación hacia otro destino no recibe el encabezado', () => {
    const { http, control } = preparar();

    http.post('https://otro.example/api', {}).subscribe();

    expect(control.expectOne('https://otro.example/api').request.headers.has('X-Luxe-Csrf')).toBe(false);
  });
});
