import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideApiConfiguration } from '../api/api-configuration';
import { SesionServicio } from './sesion.servicio';

const ADMIN = { id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' as const };

function preparar() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiConfiguration(''),
    ],
  });
  return { sesion: TestBed.inject(SesionServicio), control: TestBed.inject(HttpTestingController) };
}

describe('CLT5 — SesionServicio refleja lo que dice el servidor', () => {
  it('cargar guarda el usuario de /yo', async () => {
    const { sesion, control } = preparar();

    const carga = sesion.cargar();
    control.expectOne('/api/v1/auth/yo').flush(ADMIN);
    await carga;

    expect(sesion.usuario()).toEqual(ADMIN);
  });

  it('cargar con 401 deja el usuario en null, sin error', async () => {
    const { sesion, control } = preparar();

    const carga = sesion.cargar();
    control.expectOne('/api/v1/auth/yo').flush({ codigo: 'peticion-no-autenticada' }, { status: 401, statusText: 'x' });
    await carga;

    expect(sesion.usuario()).toBeNull();
  });

  it('cargar no vuelve a llamar al servidor si ya sabe quién es', async () => {
    const { sesion, control } = preparar();
    const primera = sesion.cargar();
    control.expectOne('/api/v1/auth/yo').flush(ADMIN);
    await primera;

    await sesion.cargar();

    control.expectNone('/api/v1/auth/yo');
  });

  it('iniciar envía correo y contraseña y guarda el usuario devuelto', async () => {
    const { sesion, control } = preparar();

    const inicio = sesion.iniciar('a@luxe.co', 'una-contrasena-larga');
    const peticion = control.expectOne('/api/v1/auth/sesion');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ email: 'a@luxe.co', contrasena: 'una-contrasena-larga' });
    peticion.flush(ADMIN);
    await inicio;

    expect(sesion.usuario()).toEqual(ADMIN);
  });

  it('iniciar con credenciales inválidas rechaza y no guarda usuario', async () => {
    const { sesion, control } = preparar();

    const inicio = sesion.iniciar('a@luxe.co', 'mala');
    control.expectOne('/api/v1/auth/sesion').flush({ codigo: 'credenciales-invalidas' }, { status: 401, statusText: 'x' });

    await expect(inicio).rejects.toBeDefined();
    expect(sesion.usuario()).toBeFalsy();
  });

  it('cerrar llama a cerrarSesion; si el servidor falla, avisa del error pero el cliente deja de creerse con sesión', async () => {
    const { sesion, control } = preparar();
    const carga = sesion.cargar();
    control.expectOne('/api/v1/auth/yo').flush(ADMIN);
    await carga;

    const cierre = sesion.cerrar();
    const peticion = control.expectOne('/api/v1/auth/sesion');
    expect(peticion.request.method).toBe('DELETE');
    peticion.flush(null, { status: 500, statusText: 'x' });
    await expect(cierre).rejects.toBeDefined();

    expect(sesion.usuario()).toBeNull();
  });

  it('expirar olvida al usuario sin llamar al servidor', async () => {
    const { sesion, control } = preparar();
    const carga = sesion.cargar();
    control.expectOne('/api/v1/auth/yo').flush(ADMIN);
    await carga;

    sesion.expirar();

    expect(sesion.usuario()).toBeNull();
    control.verify();
  });

  it('nunca guarda nada en el almacenamiento del navegador', async () => {
    const { sesion, control } = preparar();

    const inicio = sesion.iniciar('a@luxe.co', 'una-contrasena-larga');
    control.expectOne('/api/v1/auth/sesion').flush(ADMIN);
    await inicio;

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
