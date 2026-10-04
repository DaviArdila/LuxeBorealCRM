import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideApiConfiguration } from '../api/api-configuration';
import { EntrarComponent } from './entrar.component';

const ADMIN = { id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' };

async function preparar() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '', children: [] }, { path: 'entrar', component: EntrarComponent }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiConfiguration(''),
    ],
  });
  const fixture = TestBed.createComponent(EntrarComponent);
  await fixture.whenStable();
  return { fixture, control: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

function escribir(fixture: ComponentFixture<EntrarComponent>, campo: string, valor: string): void {
  const entrada = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`[name="${campo}"]`)!;
  entrada.value = valor;
  entrada.dispatchEvent(new Event('input'));
}

async function enviar(fixture: ComponentFixture<EntrarComponent>): Promise<void> {
  (fixture.nativeElement as HTMLElement).querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
  await asentar(fixture);
}

/** Deja correr las promesas pendientes (la respuesta del servidor llega por una cadena de ellas). */
async function asentar(fixture: ComponentFixture<EntrarComponent>): Promise<void> {
  if (vi.isFakeTimers()) {
    // `whenStable` espera temporizadores reales: con los falsos se avanza el reloj y se pinta a mano.
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    return;
  }
  await new Promise((resolver) => setTimeout(resolver));
  await fixture.whenStable();
}

function texto(fixture: ComponentFixture<EntrarComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function botonDeEnvio(fixture: ComponentFixture<EntrarComponent>): HTMLButtonElement {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

describe('CLT4 — Pantalla de inicio de sesión', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('CLT4 — Un inicio de sesión correcto lleva al inicio', async () => {
    const { fixture, control, router } = await preparar();

    escribir(fixture, 'email', 'a@luxe.co');
    escribir(fixture, 'contrasena', 'una-contrasena-larga');
    await enviar(fixture);
    const peticion = control.expectOne('/api/v1/auth/sesion');
    expect(peticion.request.body).toEqual({ email: 'a@luxe.co', contrasena: 'una-contrasena-larga' });
    peticion.flush(ADMIN);
    await asentar(fixture);

    expect(router.url).toBe('/');
  });

  it('CLT4 — Credenciales inválidas muestran un mensaje genérico', async () => {
    const { fixture, control } = await preparar();

    escribir(fixture, 'email', 'nadie@luxe.co');
    escribir(fixture, 'contrasena', 'mala-contrasena-larga');
    await enviar(fixture);
    control.expectOne('/api/v1/auth/sesion').flush({ codigo: 'credenciales-invalidas' }, { status: 401, statusText: 'x' });
    await asentar(fixture);

    expect(texto(fixture)).toContain('Correo o contraseña incorrectos');
    expect(texto(fixture)).not.toContain('nadie@luxe.co');
  });

  it('CLT4 — Demasiados intentos dice cuánto esperar y deshabilita el envío durante ese tiempo', async () => {
    const { fixture, control } = await preparar();
    vi.useFakeTimers();

    escribir(fixture, 'email', 'a@luxe.co');
    escribir(fixture, 'contrasena', 'una-contrasena-larga');
    await enviar(fixture);
    control
      .expectOne('/api/v1/auth/sesion')
      .flush({ codigo: 'demasiados-intentos' }, { status: 429, statusText: 'x', headers: { 'Retry-After': '600' } });
    await asentar(fixture);

    expect(texto(fixture)).toContain('10 minutos');
    expect(botonDeEnvio(fixture).disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(600_000);
    await asentar(fixture);

    expect(botonDeEnvio(fixture).disabled).toBe(false);
  });

  it('CLT4 — La contraseña y el correo no quedan en el almacenamiento ni en la URL', async () => {
    const { fixture, control, router } = await preparar();

    escribir(fixture, 'email', 'a@luxe.co');
    escribir(fixture, 'contrasena', 'una-contrasena-larga');
    await enviar(fixture);
    control.expectOne('/api/v1/auth/sesion').flush({ codigo: 'credenciales-invalidas' }, { status: 401, statusText: 'x' });
    await asentar(fixture);

    const guardado = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + router.url;
    expect(guardado).not.toContain('a@luxe.co');
    expect(guardado).not.toContain('una-contrasena-larga');
  });

  it('no envía nada si falta el correo o la contraseña', async () => {
    const { fixture, control } = await preparar();

    escribir(fixture, 'email', 'a@luxe.co');
    await enviar(fixture);

    control.expectNone('/api/v1/auth/sesion');
  });
});
