import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { REGISTRO_DE_AREAS } from './areas/registro/registro';
import { routes } from './app.routes';

describe('D9 — app.routes crea una ruta diferida por área del registro dentro del shell', () => {
  it('hay un hijo del shell por cada área, con loadChildren', () => {
    const hijos = routes[0]!.children ?? [];

    expect(hijos.map((ruta) => ruta.path)).toEqual(REGISTRO_DE_AREAS.map((area) => area.id));
    expect(hijos.every((ruta) => typeof ruta.loadChildren === 'function')).toBe(true);
  });

  it('navegar a /bot/estilo carga la pantalla del área dentro del shell', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter(routes)] });
    const arnes = await RouterTestingHarness.create();

    await arnes.navigateByUrl('/bot/estilo');

    expect(TestBed.inject(Router).url).toBe('/bot/estilo');
    expect((arnes.routeNativeElement as HTMLElement).textContent).toContain('Estilo del bot');
  });

  it('/bot redirige a la primera pantalla del área', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter(routes)] });
    const arnes = await RouterTestingHarness.create();

    await arnes.navigateByUrl('/bot');

    expect(TestBed.inject(Router).url).toBe('/bot/estilo');
  });
});
