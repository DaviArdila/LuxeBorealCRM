import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideApiMismoOrigen } from '../../../nucleo/configuracion-api';
import { EnviosComponent } from './envios.component';

const URL = '/api/v1/configuracion/envios';
const ENVIOS = { recargoContraentregaPct: 5, factorVolumetrico: 4000, actualizado: '2026-10-05T10:00:00.000Z' };

async function asentar(fixture: ComponentFixture<EnviosComponent>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  await fixture.whenStable();
}

async function abrir() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideApiMismoOrigen()],
  });
  const control = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(EnviosComponent);
  await asentar(fixture);
  control.expectOne((p) => p.method === 'GET' && p.url === URL).flush(ENVIOS);
  await asentar(fixture);
  return { fixture, control, el: fixture.nativeElement as HTMLElement };
}

function boton(texto: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;
}

function escribir(campo: string, texto: string): void {
  const control = document.querySelector<HTMLInputElement>(`[data-campo="${campo}"]`)!;
  control.value = texto;
  control.dispatchEvent(new Event('input'));
}

describe('SHL11 — Pantalla «Envíos»', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('SHL11 — La pantalla muestra el recargo y el factor volumétrico en modo lectura', async () => {
    const { el } = await abrir();

    expect(el.querySelector('[data-recargo]')!.textContent).toContain('5');
    expect(el.querySelector('[data-factor]')!.textContent).toContain('4000');
    expect(el.querySelector('input')).toBeNull();
  });

  it('SHL11 — Editar el recargo llama a guardarConfiguracionEnvios y muestra el valor nuevo y que rige desde el siguiente mensaje', async () => {
    const { fixture, control, el } = await abrir();

    boton('Editar').click();
    await asentar(fixture);
    expect(document.querySelector<HTMLInputElement>('[data-campo="recargo"]')!.value).toBe('5');
    escribir('recargo', '6.5');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);

    const guardado = control.expectOne((p) => p.method === 'PUT' && p.url === URL);
    expect(guardado.request.body).toEqual({ recargoContraentregaPct: 6.5, factorVolumetrico: 4000 });
    guardado.flush({ ...ENVIOS, recargoContraentregaPct: 6.5 });
    await asentar(fixture);

    expect(el.querySelector('[data-recargo]')!.textContent).toContain('6.5');
    expect(el.textContent).toContain('siguiente mensaje');
  });

  it('SHL11 — Un recargo inválido muestra su motivo en la ventana y conserva lo escrito', async () => {
    const { fixture, control } = await abrir();

    boton('Editar').click();
    await asentar(fixture);
    escribir('recargo', '150');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'PUT')
      .flush({ codigo: 'configuracion-invalida', title: 'x', detail: 'recargoContraentregaPct: el recargo debe estar entre 0 y 100' }, { status: 422, statusText: 'x' });
    await asentar(fixture);

    expect(document.querySelector('mat-dialog-container')!.textContent).toContain('el recargo debe estar entre 0 y 100');
    expect(document.querySelector<HTMLInputElement>('[data-campo="recargo"]')!.value).toBe('150');
  });
});
