import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { provideApiMismoOrigen } from '../../../nucleo/configuracion-api';
import { HorarioComponent } from './horario.component';

const URL_HORARIO = '/api/v1/configuracion/horario';
const URL_EXCEPCIONES = '/api/v1/configuracion/horario/excepciones';

const DIAS = {
  lun: { desde: '08:00', hasta: '18:00' },
  mar: { desde: '08:00', hasta: '18:00' },
  mie: { desde: '08:00', hasta: '18:00' },
  jue: { desde: '08:00', hasta: '18:00' },
  vie: { desde: '08:00', hasta: '18:00' },
  sab: null,
  dom: null,
};
const HORARIO = { dias: DIAS, excepciones: [], actualizado: '2026-10-05T10:00:00.000Z' };

async function asentar(fixture: ComponentFixture<HorarioComponent>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  await fixture.whenStable();
}

async function cerrada(fixture: ComponentFixture<HorarioComponent>): Promise<void> {
  const limite = Date.now() + 3000;
  while (document.querySelector('mat-dialog-container') && Date.now() < limite) {
    await new Promise((resolver) => setTimeout(resolver, 20));
    await fixture.whenStable();
  }
}

async function abrir(horario: object = HORARIO) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideApiMismoOrigen()],
  });
  const control = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(HorarioComponent);
  await asentar(fixture);
  control.expectOne((p) => p.method === 'GET' && p.url === URL_HORARIO).flush(horario);
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

describe('SHL11 — Pantalla «Horario»', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('SHL11 — La pantalla muestra los siete días en modo lectura', async () => {
    const { el } = await abrir();

    const filas = [...el.querySelectorAll('[data-dia]')].map((f) => f.textContent ?? '');
    expect(filas).toHaveLength(7);
    expect(filas[0]).toContain('Lunes');
    expect(filas[0]).toContain('08:00');
    expect(filas[0]).toContain('18:00');
    expect(filas[6]).toContain('Domingo');
    expect(filas[6]).toContain('Cerrado');
    expect(el.querySelector('input')).toBeNull();
  });

  it('SHL11 — Editar el lunes llama a guardarHorario y la pantalla muestra el lunes nuevo y que rige desde el siguiente mensaje', async () => {
    const { fixture, control, el } = await abrir();

    boton('Editar horario').click();
    await asentar(fixture);
    escribir('lun-hasta', '19:30');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);

    const guardado = control.expectOne((p) => p.method === 'PUT' && p.url === URL_HORARIO);
    expect(guardado.request.body.dias.lun).toEqual({ desde: '08:00', hasta: '19:30' });
    expect(guardado.request.body.dias.dom).toBeNull();
    guardado.flush({ ...HORARIO, dias: { ...DIAS, lun: { desde: '08:00', hasta: '19:30' } } });
    await asentar(fixture);
    await cerrada(fixture);

    expect(document.querySelector('mat-dialog-container')).toBeNull();
    expect(el.querySelector('[data-dia]')!.textContent).toContain('19:30');
    expect(el.textContent).toContain('siguiente mensaje');
    expect(el.querySelector('app-aviso.flotante')!.textContent).toContain('siguiente mensaje');
  });

  it('SHL11 — Un día cerrado se puede abrir desde la ventana', async () => {
    const { fixture, control } = await abrir();

    boton('Editar horario').click();
    await asentar(fixture);
    document.querySelector<HTMLInputElement>('[data-campo="sab-abierto"] button')!.click();
    await asentar(fixture);
    escribir('sab-desde', '09:00');
    escribir('sab-hasta', '13:00');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);

    expect(control.expectOne((p) => p.method === 'PUT').request.body.dias.sab).toEqual({ desde: '09:00', hasta: '13:00' });
  });

  it('SHL11 — Un campo inválido muestra su motivo en la ventana y conserva lo escrito', async () => {
    const { fixture, control } = await abrir();

    boton('Editar horario').click();
    await asentar(fixture);
    escribir('lun-desde', '18:00');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'PUT')
      .flush({ codigo: 'configuracion-invalida', title: 'x', detail: 'dias.lun.hasta: «lun» abre y cierra a la misma hora; márcalo cerrado o corrige el rango' }, { status: 422, statusText: 'x' });
    await asentar(fixture);

    expect(document.querySelector('mat-dialog-container')!.textContent).toContain('«lun» abre y cierra a la misma hora');
    expect(document.querySelector<HTMLInputElement>('[data-campo="lun-desde"]')!.value).toBe('18:00');
  });

  it('SHL11 — Agregar y quitar una excepción: aparece mientras existe y desaparece al quitarla', async () => {
    const { fixture, control, el } = await abrir();

    boton('Agregar excepción').click();
    await asentar(fixture);
    escribir('excepcion-fecha', '2026-12-25');
    escribir('excepcion-motivo', 'Navidad');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);
    const alta = control.expectOne((p) => p.method === 'POST' && p.url === URL_EXCEPCIONES);
    expect(alta.request.body).toEqual({ fecha: '2026-12-25', motivo: 'Navidad' });
    alta.flush({ fecha: '2026-12-25', motivo: 'Navidad' }, { status: 201, statusText: 'Created' });
    await asentar(fixture);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_HORARIO).flush({ ...HORARIO, excepciones: [{ fecha: '2026-12-25', motivo: 'Navidad' }] });
    await asentar(fixture);
    await cerrada(fixture);
    expect(el.querySelector('[data-excepciones]')!.textContent).toContain('2026-12-25');
    expect(el.querySelector('[data-excepciones]')!.textContent).toContain('Navidad');

    el.querySelector<HTMLButtonElement>('button[aria-label="Quitar excepción 2026-12-25"]')!.click();
    await asentar(fixture);
    boton('Confirmar').click();
    await asentar(fixture);
    control.expectOne((p) => p.method === 'DELETE' && p.url === `${URL_EXCEPCIONES}/2026-12-25`).flush(null, { status: 204, statusText: 'No Content' });
    await asentar(fixture);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_HORARIO).flush(HORARIO);
    await asentar(fixture);

    expect(el.querySelector('[data-excepciones]')!.textContent).not.toContain('2026-12-25');
  });

  it('SHL11 — Usa la cabecera de página: el título es el h1 y la explicación va en la ayuda, no en un aviso fijo', async () => {
    const { fixture, el } = await abrir();

    const globo = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(el.querySelector('app-cabecera-pagina h1')!.textContent).toBe('Horario de atención');
    expect(globo.message).toContain('Fuera de este horario');
    expect(el.textContent).not.toContain('Fuera de este horario');
    expect(el.querySelectorAll('app-aviso:not(.flotante)')).toHaveLength(0);
  });

  it('SHL11 — Los bloques son tarjetas de una rejilla', async () => {
    const { el } = await abrir();

    expect(el.querySelectorAll('app-rejilla > mat-card')).toHaveLength(2);
  });
});
