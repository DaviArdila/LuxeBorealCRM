import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AREAS_REGISTRADAS } from '../nucleo/areas.token';
import type { DefinicionArea } from '../nucleo/definicion-area';
import { AvisosServicio } from '../nucleo/avisos.servicio';
import { provideApiMismoOrigen } from '../nucleo/configuracion-api';
import { SesionServicio, type Usuario } from '../nucleo/sesion.servicio';
import { ShellComponent } from './shell.component';

const BOT: DefinicionArea = {
  id: 'bot',
  titulo: 'Bot',
  icono: 'pi pi-comments',
  roles: ['admin'],
  menu: [
    { titulo: 'Estilo del bot', ruta: '/bot/estilo', roles: ['admin'] },
    { titulo: 'Mensajes fijos', ruta: '/bot/mensajes-fijos', roles: ['admin'] },
  ],
  rutas: () => Promise.resolve([]),
};
const PRUEBA: DefinicionArea = {
  id: 'prueba',
  titulo: 'Prueba',
  icono: 'pi pi-star',
  roles: ['admin', 'asesor'],
  menu: [{ titulo: 'Pantalla de prueba', ruta: '/prueba/uno', roles: ['admin', 'asesor'] }],
  rutas: () => Promise.resolve([]),
};
const ADMIN: Usuario = { id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' };
const ASESOR: Usuario = { id: 'u2', email: 'b@luxe.co', nombre: 'Beto', rol: 'asesor' };

async function preparar(usuario: Usuario, areas: readonly DefinicionArea[]) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: 'entrar', children: [] }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiMismoOrigen(),
      { provide: AREAS_REGISTRADAS, useValue: areas },
    ],
  });
  TestBed.inject(SesionServicio).usuario.set(usuario);
  const fixture = TestBed.createComponent(ShellComponent);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, control: TestBed.inject(HttpTestingController) };
}

describe('CLT9 — El shell arma el menú desde el registro y el rol', () => {
  it('CLT9 — Un área registrada aparece en el menú de su rol, sin tocar el shell', async () => {
    const { el } = await preparar(ADMIN, [BOT, PRUEBA]);

    expect(el.textContent).toContain('Estilo del bot');
    expect(el.textContent).toContain('Mensajes fijos');
    expect(el.textContent).toContain('Pantalla de prueba');
  });

  it('CLT9 — El menú no muestra las áreas que el rol no puede usar', async () => {
    const { el } = await preparar(ASESOR, [BOT, PRUEBA]);

    expect(el.textContent).not.toContain('Estilo del bot');
    expect(el.textContent).not.toContain('Mensajes fijos');
    expect(el.textContent).toContain('Pantalla de prueba');
  });

  it('muestra el nombre del usuario', async () => {
    const { el } = await preparar(ADMIN, [BOT]);

    expect(el.textContent).toContain('Ana');
  });
});

describe('CLT5 — Cerrar sesión y aviso de permiso', () => {
  it('CLT5 — Cerrar sesión llama a cerrarSesion y vuelve al inicio de sesión', async () => {
    const { el, control } = await preparar(ADMIN, [BOT]);

    el.querySelector<HTMLButtonElement>('[data-accion="cerrar-sesion"] button')!.click();
    const peticion = control.expectOne('/api/v1/auth/sesion');
    expect(peticion.request.method).toBe('DELETE');
    peticion.flush(null, { status: 204, statusText: 'x' });
    await new Promise((resolver) => setTimeout(resolver));

    expect(TestBed.inject(Router).url).toBe('/entrar');
    expect(TestBed.inject(SesionServicio).usuario()).toBeNull();
  });

  it('CLT5 — Un 403 muestra el aviso de permiso insuficiente y la sesión sigue', async () => {
    const { fixture, el } = await preparar(ADMIN, [BOT]);

    TestBed.inject(AvisosServicio).permisoInsuficiente.set(true);
    await fixture.whenStable();

    expect(el.textContent).toContain('No tienes permiso');
    expect(TestBed.inject(SesionServicio).usuario()).toEqual(ADMIN);
  });
});
