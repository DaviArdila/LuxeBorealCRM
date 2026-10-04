import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideApiMismoOrigen } from '../../../nucleo/configuracion-api';
import { MensajesFijosComponent } from './mensajes-fijos.component';

const URL_LISTA = '/api/v1/mensajes-fijos';
const CLAVES = [
  'mensaje_handoff', 'mensaje_handoff_fuera_horario', 'aviso_datos', 'mensaje_techo_gasto', 'mensaje_error_generico',
  'mensaje_audio_no_soportado', 'mensaje_imagen_no_procesada', 'mensaje_catalogo_vacio', 'mensaje_llm_no_disponible',
  'mensaje_sin_respuesta',
];

function mensaje(clave: string, extra: Record<string, unknown> = {}) {
  return {
    clave,
    descripcion: `Descripción de ${clave}`,
    texto: `Respaldo de ${clave}`,
    origen: 'respaldo',
    actualizado: null,
    ...extra,
  };
}

const LISTA = {
  mensajes: CLAVES.map((clave) => {
    if (clave === 'mensaje_handoff') {
      return mensaje(clave, { texto: 'Texto editado.', origen: 'base', actualizado: '2026-10-02T15:00:00.000Z' });
    }
    if (clave === 'aviso_datos') {
      return mensaje(clave, {
        descripcion: 'Aviso de asistente automatizado y del uso de sus datos (R14): no lo dejes vacío.',
      });
    }
    return mensaje(clave);
  }),
};

async function asentar(fixture: ComponentFixture<MensajesFijosComponent>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  await fixture.whenStable();
}

async function abrir() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideApiMismoOrigen()],
  });
  const control = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(MensajesFijosComponent);
  await asentar(fixture);
  control.expectOne(URL_LISTA).flush(LISTA);
  await asentar(fixture);
  return { fixture, control, el: fixture.nativeElement as HTMLElement };
}

function fila(el: HTMLElement, clave: string): HTMLElement {
  return el.querySelector<HTMLElement>(`[data-clave="${clave}"]`)!;
}

function boton(el: HTMLElement, texto: string): HTMLButtonElement {
  return [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;
}

async function editar(fixture: ComponentFixture<MensajesFijosComponent>, el: HTMLElement, clave: string, texto: string) {
  fila(el, clave).querySelector<HTMLButtonElement>('button')!.click();
  await asentar(fixture);
  const area = el.querySelector('textarea')!;
  area.value = texto;
  area.dispatchEvent(new Event('input'));
  await asentar(fixture);
}

describe('CLT8 — Pantalla «Mensajes fijos»', () => {
  it('CLT8 — Lista los diez mensajes con descripción, texto y origen', async () => {
    const { el } = await abrir();

    expect(el.querySelectorAll('[data-clave]')).toHaveLength(10);
    expect(fila(el, 'mensaje_handoff').textContent).toContain('Texto editado.');
    expect(fila(el, 'mensaje_handoff').textContent).toContain('Editado');
    expect(fila(el, 'mensaje_handoff').textContent).toContain('02/10/2026');
    expect(fila(el, 'mensaje_techo_gasto').textContent).toContain('Texto de respaldo');
    expect(fila(el, 'mensaje_techo_gasto').textContent).toContain('Descripción de mensaje_techo_gasto');
  });

  it('CLT8 — La descripción de aviso_datos advierte del aviso de asistente automatizado (R14)', async () => {
    const { el } = await abrir();

    expect(fila(el, 'aviso_datos').textContent).toContain('asistente automatizado');
    expect(fila(el, 'aviso_datos').textContent).toContain('R14');
  });

  it('CLT8 — Editar abre el editor con el texto y un contador sobre 1.000', async () => {
    const { fixture, el } = await abrir();

    fila(el, 'mensaje_handoff').querySelector<HTMLButtonElement>('button')!.click();
    await asentar(fixture);

    expect(el.querySelector('textarea')!.value).toBe('Texto editado.');
    expect(el.textContent).toContain('14 / 1000');
  });

  it('CLT8 — Guardar actualiza la fila con el texto nuevo, el origen base y la fecha', async () => {
    const { fixture, control, el } = await abrir();
    await editar(fixture, el, 'mensaje_techo_gasto', 'Hoy no puedo seguir, escríbenos mañana.');

    boton(el, 'Guardar').click();
    await asentar(fixture);
    const peticion = control.expectOne((p) => p.method === 'PUT' && p.url === `${URL_LISTA}/mensaje_techo_gasto`);
    expect(peticion.request.body).toEqual({ texto: 'Hoy no puedo seguir, escríbenos mañana.' });
    peticion.flush(
      mensaje('mensaje_techo_gasto', {
        texto: 'Hoy no puedo seguir, escríbenos mañana.',
        origen: 'base',
        actualizado: '2026-10-04T15:00:00.000Z',
      }),
    );
    await asentar(fixture);

    const guardada = fila(el, 'mensaje_techo_gasto').textContent;
    expect(guardada).toContain('Hoy no puedo seguir, escríbenos mañana.');
    expect(guardada).toContain('Editado');
    expect(guardada).toContain('04/10/2026');
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('CLT8 — Un 422 muestra el motivo del servidor y el editor conserva lo escrito', async () => {
    const { fixture, control, el } = await abrir();
    await editar(fixture, el, 'mensaje_handoff', 'Cuesta $50.000 pesos.');

    boton(el, 'Guardar').click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'PUT')
      .flush(
        { codigo: 'mensaje-fijo-invalido', title: 'Mensaje inválido', detail: 'contiene un valor en pesos' },
        { status: 422, statusText: 'x' },
      );
    await asentar(fixture);

    expect(el.textContent).toContain('contiene un valor en pesos');
    expect(el.querySelector('textarea')!.value).toBe('Cuesta $50.000 pesos.');
    expect(fila(el, 'mensaje_handoff').textContent).toContain('Texto editado.');
  });

  it('Cancelar cierra el editor sin guardar', async () => {
    const { fixture, control, el } = await abrir();
    await editar(fixture, el, 'mensaje_handoff', 'Cambio que no se guarda.');

    boton(el, 'Cancelar').click();
    await asentar(fixture);

    expect(el.querySelector('textarea')).toBeNull();
    control.expectNone((p) => p.method === 'PUT');
    expect(fila(el, 'mensaje_handoff').textContent).toContain('Texto editado.');
  });
});
