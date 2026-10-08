import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideApiMismoOrigen } from '../../../nucleo/configuracion-api';
import { GastoLlmComponent } from './gasto-llm.component';

const URL = '/api/v1/configuracion/gasto-llm';
const GASTO = {
  techoMensualUsd: 20,
  estado: { mes: '2026-10', avisoEmitido: true, bloqueado: false },
  gastoMesUsd: 16.5,
  actualizado: '2026-10-05T10:00:00.000Z',
};

async function asentar(fixture: ComponentFixture<GastoLlmComponent>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  await fixture.whenStable();
}

async function abrir(gasto: object = GASTO) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideApiMismoOrigen()],
  });
  const control = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(GastoLlmComponent);
  await asentar(fixture);
  control.expectOne((p) => p.method === 'GET' && p.url === URL).flush(gasto);
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

describe('SHL11 — Pantalla «Gasto del LLM»', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('SHL11 — El techo es editable y el estado y el gasto del mes son de solo lectura', async () => {
    const { fixture, el } = await abrir();

    expect(el.querySelector('[data-techo]')!.textContent).toContain('20');
    expect(el.querySelector('[data-gasto]')!.textContent).toContain('16.5');
    expect(el.querySelector('[data-estado]')!.textContent).toContain('2026-10');
    expect(el.querySelector('[data-estado]')!.textContent).toContain('Aviso del 80 %');
    expect(el.querySelector('input, button[aria-label*="estado"]')).toBeNull();

    boton('Editar techo').click();
    await asentar(fixture);
    expect(document.querySelectorAll('mat-dialog-container input')).toHaveLength(1);
    expect(document.querySelector<HTMLInputElement>('[data-campo="techo"]')!.value).toBe('20');
  });

  it('SHL11 — Guardar el techo llama a guardarGastoLlm y muestra que rige desde la siguiente solicitud', async () => {
    const { fixture, control, el } = await abrir();

    boton('Editar techo').click();
    await asentar(fixture);
    escribir('techo', '30');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);

    const guardado = control.expectOne((p) => p.method === 'PUT' && p.url === URL);
    expect(guardado.request.body).toEqual({ techoMensualUsd: 30 });
    guardado.flush({ ...GASTO, techoMensualUsd: 30 });
    await asentar(fixture);

    expect(el.querySelector('[data-techo]')!.textContent).toContain('30');
    expect(el.textContent).toContain('siguiente mensaje');
    expect(el.querySelector('app-aviso.flotante')!.textContent).toContain('siguiente mensaje');
  });

  it('SHL11 — Un techo inválido muestra su motivo en la ventana y conserva lo escrito', async () => {
    const { fixture, control } = await abrir();

    boton('Editar techo').click();
    await asentar(fixture);
    escribir('techo', '0');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'PUT')
      .flush({ codigo: 'configuracion-invalida', title: 'x', detail: 'techoMensualUsd: el techo debe ser mayor que 0' }, { status: 422, statusText: 'x' });
    await asentar(fixture);

    expect(document.querySelector('mat-dialog-container')!.textContent).toContain('el techo debe ser mayor que 0');
    expect(document.querySelector<HTMLInputElement>('[data-campo="techo"]')!.value).toBe('0');
  });

  it('SHL11 — Sin techo guardado dice que rige el del entorno', async () => {
    const { el } = await abrir({ techoMensualUsd: null, estado: null, gastoMesUsd: null, actualizado: null });

    expect(el.querySelector('[data-techo]')!.textContent).toContain('entorno');
  });

  it('SHL11 — Usa la cabecera de página: el título es el h1 y la explicación va en la ayuda, no en un aviso fijo', async () => {
    const { fixture, el } = await abrir();

    expect(el.textContent).not.toContain('El techo limita');
    el.querySelector<HTMLButtonElement>('button[data-accion="ayuda-avisos"]')!.click();
    await fixture.whenStable();
    const ayuda = el.querySelector('[data-ayuda]')!.textContent;
    expect(el.querySelector('app-cabecera-pagina h1')!.textContent).toBe('Gasto del LLM');
    expect(ayuda).toContain('El techo limita');
    expect(el.querySelectorAll('app-aviso:not(.flotante)')).toHaveLength(0);
  });

  it('SHL11 — Los bloques son tarjetas de una rejilla', async () => {
    const { el } = await abrir();

    expect(el.querySelectorAll('app-rejilla > mat-card')).toHaveLength(2);
  });
});
