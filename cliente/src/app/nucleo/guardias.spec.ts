import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { provideApiConfiguration } from '../api/api-configuration';
import { guardiaDeRol, guardiaDeSesion } from './guardias';
import { SesionServicio } from './sesion.servicio';

const RUTA = {} as ActivatedRouteSnapshot;
const ESTADO = { url: '/bot/estilo' } as RouterStateSnapshot;

function preparar() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiConfiguration(''),
    ],
  });
  return { control: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

async function ejecutar<T>(accion: () => T): Promise<Awaited<T>> {
  return await TestBed.runInInjectionContext(accion);
}

describe('CLT5 — Las guardias de ruta solo reflejan lo que dice el servidor', () => {
  it('CLT5 — Sin sesión (401) la guardia de sesión lleva a /entrar', async () => {
    const { control, router } = preparar();

    const resultado = ejecutar(() => guardiaDeSesion(RUTA, ESTADO));
    await Promise.resolve();
    control.expectOne('/api/v1/auth/yo').flush({ codigo: 'peticion-no-autenticada' }, { status: 401, statusText: 'x' });

    const destino = await resultado;
    expect(destino).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(destino as UrlTree)).toBe('/entrar');
  });

  it('con sesión la guardia de sesión deja pasar', async () => {
    const { control } = preparar();

    const resultado = ejecutar(() => guardiaDeSesion(RUTA, ESTADO));
    await Promise.resolve();
    control.expectOne('/api/v1/auth/yo').flush({ id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' });

    expect(await resultado).toBe(true);
  });

  it('CLT5 — Un asesor en una ruta de admin va al inicio', async () => {
    const { control, router } = preparar();
    const sesion = TestBed.inject(SesionServicio);
    const carga = sesion.cargar();
    control.expectOne('/api/v1/auth/yo').flush({ id: 'u2', email: 'b@luxe.co', nombre: 'Beto', rol: 'asesor' });
    await carga;

    const destino = await ejecutar(() => guardiaDeRol(['admin'])(RUTA, ESTADO));

    expect(destino).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(destino as UrlTree)).toBe('/');
  });

  it('un admin pasa por una ruta de admin', async () => {
    const { control } = preparar();
    const sesion = TestBed.inject(SesionServicio);
    const carga = sesion.cargar();
    control.expectOne('/api/v1/auth/yo').flush({ id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' });
    await carga;

    expect(await ejecutar(() => guardiaDeRol(['admin'])(RUTA, ESTADO))).toBe(true);
  });
});
