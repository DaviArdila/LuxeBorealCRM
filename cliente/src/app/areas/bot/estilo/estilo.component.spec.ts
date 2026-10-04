import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideApiMismoOrigen } from '../../../nucleo/configuracion-api';
import { EstiloComponent } from './estilo.component';

const URL_ESTILO = '/api/v1/agente/estilo';
const URL_HISTORIAL = '/api/v1/agente/estilo/historial';
const HISTORIAL = {
  versiones: [
    { version: 2, fecha: '2026-10-03T15:00:00.000Z', texto: 'Estilo dos. '.repeat(30) },
    { version: 1, fecha: '2026-10-01T15:00:00.000Z', texto: 'Estilo uno completo.' },
  ],
};

async function montar() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideApiMismoOrigen()],
  });
  const control = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(EstiloComponent);
  await asentar(fixture);
  return { fixture, control, el: fixture.nativeElement as HTMLElement };
}

async function asentar(fixture: ComponentFixture<EstiloComponent>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  await fixture.whenStable();
}

/** Atiende las dos lecturas con las que la pantalla se abre. */
async function abrir(vigente = { version: 3, origen: 'base', texto: 'Estilo vigente.' }) {
  const montada = await montar();
  montada.control.expectOne(URL_ESTILO).flush(vigente);
  montada.control.expectOne(URL_HISTORIAL).flush(HISTORIAL);
  await asentar(montada.fixture);
  return montada;
}

function boton(el: HTMLElement, texto: string): HTMLButtonElement {
  const todos = [...el.querySelectorAll<HTMLButtonElement>('button'), ...document.querySelectorAll<HTMLButtonElement>('button')];
  return todos.find((b) => b.textContent?.trim() === texto)!;
}

function escribir(el: HTMLElement, texto: string): void {
  const area = el.querySelector('textarea')!;
  area.value = texto;
  area.dispatchEvent(new Event('input'));
}

describe('CLT7 — Pantalla «Estilo del bot»', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('CLT7 — Muestra el estilo vigente: versión, origen y texto en el editor', async () => {
    const { el } = await abrir();

    expect(el.textContent).toContain('Versión 3');
    expect(el.textContent).toContain('base');
    expect(el.querySelector('textarea')!.value).toBe('Estilo vigente.');
    expect(el.textContent).toContain('15 / 4000');
  });

  it('con origen archivo (sin versión) lo dice en vez de inventar una versión', async () => {
    const { el } = await abrir({ version: null as unknown as number, origen: 'archivo', texto: 'Del archivo.' });

    expect(el.textContent).toContain('archivo');
    expect(el.textContent).not.toContain('Versión null');
  });

  it('CLT7 — Publicar pide confirmación, llama a publicarEstilo y muestra la versión nueva con el recordatorio de evals', async () => {
    const { fixture, control, el } = await abrir();
    escribir(el, 'Estilo nuevo.');
    await asentar(fixture);

    boton(el, 'Publicar').click();
    await asentar(fixture);
    control.expectNone(URL_ESTILO);
    boton(el, 'Confirmar').click();
    await asentar(fixture);

    const publicacion = control.expectOne((p) => p.method === 'PUT' && p.url === URL_ESTILO);
    expect(publicacion.request.body).toEqual({ texto: 'Estilo nuevo.' });
    publicacion.flush({ version: 4 });
    await asentar(fixture);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_ESTILO).flush({ version: 4, origen: 'base', texto: 'Estilo nuevo.' });
    control.expectOne(URL_HISTORIAL).flush(HISTORIAL);
    await asentar(fixture);

    expect(el.textContent).toContain('Versión 4');
    expect(el.textContent).toContain('evals reales');
  });

  it('CLT7 — Cancelar la confirmación no publica nada', async () => {
    const { fixture, control, el } = await abrir();
    escribir(el, 'Otro estilo.');
    await asentar(fixture);

    boton(el, 'Publicar').click();
    await asentar(fixture);
    boton(el, 'Cancelar').click();
    await asentar(fixture);

    control.expectNone((p) => p.method === 'PUT');
  });

  it('CLT7 — Un 422 muestra el motivo del servidor y el editor conserva lo escrito', async () => {
    const { fixture, control, el } = await abrir();
    escribir(el, 'Cuesta $50.000 pesos.');
    await asentar(fixture);

    boton(el, 'Publicar').click();
    await asentar(fixture);
    boton(el, 'Confirmar').click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'PUT')
      .flush({ codigo: 'estilo-invalido', title: 'Estilo inválido', detail: 'contiene un valor en pesos' }, { status: 422, statusText: 'x' });
    await asentar(fixture);

    expect(el.textContent).toContain('contiene un valor en pesos');
    expect(el.querySelector('textarea')!.value).toBe('Cuesta $50.000 pesos.');
    expect(el.textContent).not.toContain('evals reales');
  });

  it('CLT7 — El historial lista versión, fecha y un extracto, y permite ver el texto completo', async () => {
    const { fixture, el } = await abrir();

    expect(el.textContent).toContain('Versión 2');
    expect(el.textContent).toContain('03/10/2026');
    expect(el.textContent).not.toContain('Estilo dos. '.repeat(30));

    boton(el, 'Ver texto').click();
    await asentar(fixture);

    expect(el.textContent).toContain('Estilo dos. '.repeat(30).trim());
  });

  it('CLT7 — Restaurar una versión pide confirmación, llama a restaurarEstilo y muestra la versión nueva', async () => {
    const { fixture, control, el } = await abrir();

    const restaurar = [...el.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent?.trim() === 'Restaurar');
    restaurar[1]!.click(); // la versión 1
    await asentar(fixture);
    boton(el, 'Confirmar').click();
    await asentar(fixture);

    const peticion = control.expectOne((p) => p.method === 'POST' && p.url === '/api/v1/agente/estilo/restauraciones');
    expect(peticion.request.body).toEqual({ version: 1 });
    peticion.flush({ version: 5 });
    await asentar(fixture);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_ESTILO).flush({ version: 5, origen: 'base', texto: 'Estilo uno completo.' });
    control.expectOne(URL_HISTORIAL).flush(HISTORIAL);
    await asentar(fixture);

    expect(el.textContent).toContain('Versión 5');
    expect(el.textContent).toContain('evals reales');
    expect(el.querySelector('textarea')!.value).toBe('Estilo uno completo.');
  });
});
