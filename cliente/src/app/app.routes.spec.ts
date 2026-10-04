import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideApiConfiguration } from './api/api-configuration';
import { REGISTRO_DE_AREAS } from './areas/registro/registro';
import { routes } from './app.routes';
import { AREAS_REGISTRADAS } from './nucleo/areas.token';

const ADMIN = { id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' };
const ASESOR = { id: 'u2', email: 'b@luxe.co', nombre: 'Beto', rol: 'asesor' };

function preparar() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(routes),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiConfiguration(''),
      { provide: AREAS_REGISTRADAS, useValue: REGISTRO_DE_AREAS },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/** Navega y responde a `/yo`, que la guardia de sesión pregunta al abrir la app. */
async function navegar(url: string, yo: { body: object; status?: number }): Promise<RouterTestingHarness> {
  const control = TestBed.inject(HttpTestingController);
  const arnes = await RouterTestingHarness.create();
  const navegacion = arnes.navigateByUrl(url);
  const peticion = await vi.waitFor(() => {
    const [primera] = control.match('/api/v1/auth/yo');
    if (!primera) throw new Error('la guardia todavía no pregunta por /yo');
    return primera;
  });
  peticion.flush(yo.body, { status: yo.status ?? 200, statusText: 'x' });
  await navegacion;
  return arnes;
}

describe('D9 — app.routes crea una ruta diferida por área del registro dentro del shell', () => {
  it('hay un hijo del shell por cada área, con loadChildren y guardia de rol', () => {
    const shell = routes.find((ruta) => ruta.path === '')!;
    const areas = (shell.children ?? []).filter((ruta) => ruta.loadChildren !== undefined);

    expect(areas.map((ruta) => ruta.path)).toEqual(REGISTRO_DE_AREAS.map((area) => area.id));
    expect(areas.every((ruta) => ruta.canActivate?.length === 1)).toBe(true);
  });

  it('CLT5 — Sin sesión, abrir /bot/estilo lleva a /entrar', async () => {
    preparar();

    await navegar('/bot/estilo', { body: { codigo: 'peticion-no-autenticada' }, status: 401 });

    expect(TestBed.inject(Router).url).toBe('/entrar');
  });

  it('un admin con sesión abre /bot/estilo dentro del shell', async () => {
    preparar();

    const arnes = await navegar('/bot/estilo', { body: ADMIN });

    expect(TestBed.inject(Router).url).toBe('/bot/estilo');
    expect((arnes.routeNativeElement as HTMLElement).textContent).toContain('Estilo del bot');
  });

  it('CLT5 — Un asesor que abre /bot/estilo a mano va al inicio', async () => {
    preparar();

    await navegar('/bot/estilo', { body: ASESOR });

    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('/bot redirige a la primera pantalla del área', async () => {
    preparar();

    await navegar('/bot', { body: ADMIN });

    expect(TestBed.inject(Router).url).toBe('/bot/estilo');
  });
});
