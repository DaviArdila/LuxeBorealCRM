import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideApiConfiguration } from '../api/api-configuration';
import { AvisosServicio } from './avisos.servicio';
import { erroresHttpInterceptor } from './errores-http.interceptor';
import { SesionServicio } from './sesion.servicio';

function preparar() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', children: [] }]),
      provideHttpClient(withInterceptors([erroresHttpInterceptor])),
      provideHttpClientTesting(),
      provideApiConfiguration(''),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    control: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    sesion: TestBed.inject(SesionServicio),
    avisos: TestBed.inject(AvisosServicio),
  };
}

describe('CLT5 — 401 y 403 de cualquier llamada', () => {
  it('CLT5 — Una sesión vencida a mitad de uso (401) lleva a /entrar y olvida al usuario', async () => {
    const { http, control, router, sesion } = preparar();
    sesion.usuario.set({ id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' });

    http.get('/api/v1/agente/estilo').subscribe({ error: () => undefined });
    control.expectOne('/api/v1/agente/estilo').flush({ codigo: 'peticion-no-autenticada' }, { status: 401, statusText: 'x' });
    await new Promise((resolver) => setTimeout(resolver));

    expect(router.url).toBe('/entrar');
    expect(sesion.usuario()).toBeNull();
  });

  it('un 401 del propio inicio de sesión no redirige: lo muestra la pantalla', async () => {
    const { http, control, router } = preparar();
    await router.navigateByUrl('/entrar');

    http.post('/api/v1/auth/sesion', {}).subscribe({ error: () => undefined });
    control.expectOne('/api/v1/auth/sesion').flush({ codigo: 'credenciales-invalidas' }, { status: 401, statusText: 'x' });

    expect(router.url).toBe('/entrar');
  });

  it('CLT5 — Un 403 muestra el aviso de permiso insuficiente y no cierra la sesión', () => {
    const { http, control, sesion, avisos } = preparar();
    sesion.usuario.set({ id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' });

    http.get('/api/v1/agente/estilo').subscribe({ error: () => undefined });
    control.expectOne('/api/v1/agente/estilo').flush({ codigo: 'rol-insuficiente' }, { status: 403, statusText: 'x' });

    expect(avisos.permisoInsuficiente()).toBe(true);
    expect(sesion.usuario()).not.toBeNull();
  });
});
