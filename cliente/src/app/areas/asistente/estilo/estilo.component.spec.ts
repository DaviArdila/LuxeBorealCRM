import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideApiMismoOrigen } from '../../../nucleo/configuracion-api';
import { EstiloComponent } from './estilo.component';

const URL_ESTILO = '/api/v1/agente/estilo';
const URL_HISTORIAL = '/api/v1/agente/estilo/historial';
const URL_SECCIONES = '/api/v1/agente/estilo/secciones';
const URL_ORDEN = '/api/v1/agente/estilo/secciones/orden';
const VIGENTE = { version: 3, origen: 'base', texto: 'Compuesto.', publicadoPor: { id: 'u-2', nombre: 'Ana' } };
const HISTORIAL = {
  versiones: [
    { version: 2, fecha: '2026-10-03T15:00:00.000Z', texto: 'Estilo dos. '.repeat(30), publicadoPor: { id: 'u-1', nombre: 'Luis' } },
    { version: 1, fecha: '2026-10-01T15:00:00.000Z', texto: 'Estilo uno completo.', publicadoPor: null },
  ],
};

function seccion(id: string, titulo: string, orden: number, extra: Record<string, unknown> = {}) {
  return { id, titulo, texto: `Texto de ${titulo}.`, orden, activo: true, actualizado: `2026-10-0${orden + 1}T10:00:00.000Z`, ...extra };
}

function lista(
  secciones = [seccion('s-1', 'Saludo', 0), seccion('s-2', 'Formato', 1), seccion('s-3', 'Cierre', 2, { activo: false })],
  caracteres = 120,
) {
  return { secciones, caracteresCompuestos: caracteres, maximo: 4000 };
}

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

/** La animación de cierre de Material no tiene duración fija en jsdom: se espera por tiempo, no por vueltas. */
async function cerrada(fixture: ComponentFixture<EstiloComponent>): Promise<void> {
  const limite = Date.now() + 3000;
  while (document.querySelector('mat-dialog-container') && Date.now() < limite) {
    await new Promise((resolver) => setTimeout(resolver, 20));
    await fixture.whenStable();
  }
}

type Montada = Awaited<ReturnType<typeof montar>>;

/** Atiende las tres lecturas con las que la pantalla se abre o se recarga. */
function atenderLecturas(control: HttpTestingController, secciones: object = lista(), vigente: object = VIGENTE): void {
  control.expectOne((p) => p.method === 'GET' && p.url === URL_ESTILO).flush(vigente);
  control.expectOne((p) => p.method === 'GET' && p.url === URL_HISTORIAL).flush(HISTORIAL);
  control.expectOne((p) => p.method === 'GET' && p.url === URL_SECCIONES).flush(secciones);
}

async function abrir(secciones: object = lista(), vigente: object = VIGENTE) {
  const montada = await montar();
  atenderLecturas(montada.control, secciones, vigente);
  await asentar(montada.fixture);
  return montada;
}

function boton(texto: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;
}

function porEtiqueta(etiqueta: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${etiqueta}"]`)!;
}

function escribir(campo: string, texto: string): void {
  const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-campo="${campo}"]`)!;
  control.value = texto;
  control.dispatchEvent(new Event('input'));
}

function problema(codigo: string, detalle: string, estado: number) {
  return [{ codigo, title: codigo, detail: detalle }, { status: estado, statusText: 'x' }] as const;
}

/** Abre «Editar Saludo» y deja la ventana con el texto escrito. */
async function editarSaludo(montada: Montada, texto: string): Promise<void> {
  porEtiqueta('Editar Saludo').click();
  await asentar(montada.fixture);
  escribir('texto', texto);
  await asentar(montada.fixture);
}

describe('Pantalla «Estilo del bot» en secciones', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('lista las secciones en su orden, con su estado y su largo', async () => {
    const { el } = await abrir();

    const filas = [...el.querySelectorAll('[data-seccion]')];
    expect(filas.map((f) => f.querySelector('strong')!.textContent)).toEqual(['Saludo', 'Formato', 'Cierre']);
    expect(filas[0]!.textContent).toContain(`${'Texto de Saludo.'.length} caracteres`);
    expect(filas[2]!.textContent).toContain('Apagada');
  });

  it('muestra la versión vigente con su origen y su autor', async () => {
    const { el } = await abrir();

    expect(el.querySelector('.vigente')!.textContent).toContain('Versión 3');
    expect(el.querySelector('.vigente')!.textContent).toContain('Ana');
  });

  it('con origen archivo (sin versión) lo dice en vez de inventar una versión', async () => {
    const { el } = await abrir(lista(), { version: null, origen: 'archivo', texto: 'Del archivo.', publicadoPor: null });

    expect(el.textContent).toContain('archivo');
    expect(el.textContent).not.toContain('Versión null');
  });

  it('muestra el contador global y avisa cerca del tope', async () => {
    const { el } = await abrir(lista(undefined, 3700));

    expect(el.querySelector('[data-contador-global]')!.textContent).toContain('3700 / 4000');
    expect(el.querySelector('[data-aviso-tope]')).not.toBeNull();
  });

  it('sin acercarse al tope no muestra el aviso', async () => {
    const { el } = await abrir();

    expect(el.querySelector('[data-contador-global]')!.textContent).toContain('120 / 4000');
    expect(el.querySelector('[data-aviso-tope]')).toBeNull();
  });

  it('apagar una sección manda `actualizado` y `activo: false` y recarga', async () => {
    const { fixture, control } = await abrir();

    document.querySelector<HTMLElement>('[data-seccion] button[role="switch"]')!.click();
    await asentar(fixture);

    const peticion = control.expectOne((p) => p.method === 'PATCH' && p.url === `${URL_SECCIONES}/s-1`);
    expect(peticion.request.body).toEqual({ actualizado: '2026-10-01T10:00:00.000Z', activo: false });
    peticion.flush(seccion('s-1', 'Saludo', 0, { activo: false }));
    await asentar(fixture);
    atenderLecturas(control, lista([seccion('s-1', 'Saludo', 0, { activo: false }), seccion('s-2', 'Formato', 1)], 40));
    await asentar(fixture);

    expect(document.querySelector('[data-contador-global]')!.textContent).toContain('40 / 4000');
  });

  it('«Nueva sección» crea con título y texto y recarga la lista', async () => {
    const { fixture, control } = await abrir();

    boton('Nueva sección').click();
    await asentar(fixture);
    escribir('titulo', 'Despedida');
    escribir('texto', 'Cierra con calidez.');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);

    const peticion = control.expectOne((p) => p.method === 'POST' && p.url === URL_SECCIONES);
    expect(peticion.request.body).toEqual({ titulo: 'Despedida', texto: 'Cierra con calidez.', activo: true });
    peticion.flush(seccion('s-4', 'Despedida', 3));
    await asentar(fixture);
    atenderLecturas(control, lista([seccion('s-1', 'Saludo', 0), seccion('s-4', 'Despedida', 1)]));
    await asentar(fixture);
    await cerrada(fixture);

    expect(document.querySelector('mat-dialog-container')).toBeNull();
    expect(document.body.textContent).toContain('Despedida');
  });

  it('«Editar» abre la ventana con título, texto y contador y guarda con `actualizado`', async () => {
    const montada = await abrir();
    const { fixture, control } = montada;

    porEtiqueta('Editar Saludo').click();
    await asentar(fixture);
    expect(document.querySelector<HTMLInputElement>('[data-campo="titulo"]')!.value).toBe('Saludo');
    expect(document.querySelector('mat-dialog-container')!.textContent).toContain(`${'Texto de Saludo.'.length} / 4000`);

    escribir('texto', 'Hola, soy Luxe.');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);

    const peticion = control.expectOne((p) => p.method === 'PATCH' && p.url === `${URL_SECCIONES}/s-1`);
    expect(peticion.request.body).toEqual({ actualizado: '2026-10-01T10:00:00.000Z', titulo: 'Saludo', texto: 'Hola, soy Luxe.' });
    peticion.flush(seccion('s-1', 'Saludo', 0));
    await asentar(fixture);
    atenderLecturas(control);
    await asentar(fixture);
    await cerrada(fixture);

    expect(document.querySelector('mat-dialog-container')).toBeNull();
  });

  it('un 422 queda dentro de la ventana con el motivo del servidor y conserva el texto', async () => {
    const montada = await abrir();
    await editarSaludo(montada, 'Cuesta $50.000 pesos.');

    boton('Guardar').click();
    await asentar(montada.fixture);
    montada.control.expectOne((p) => p.method === 'PATCH').flush(...problema('estilo-invalido', 'contiene un valor en pesos', 422));
    await asentar(montada.fixture);

    expect(document.querySelector('mat-dialog-container')!.textContent).toContain('contiene un valor en pesos');
    expect(document.querySelector<HTMLTextAreaElement>('[data-campo="texto"]')!.value).toBe('Cuesta $50.000 pesos.');
  });

  it('un 409 por título repetido muestra el motivo dentro de la ventana', async () => {
    const montada = await abrir();
    await editarSaludo(montada, 'Otro texto.');

    boton('Guardar').click();
    await asentar(montada.fixture);
    montada.control.expectOne((p) => p.method === 'PATCH').flush(...problema('seccion-duplicada', 'ya existe una sección «Saludo»', 409));
    await asentar(montada.fixture);

    expect(document.querySelector('mat-dialog-container')!.textContent).toContain('ya existe una sección «Saludo»');
    montada.control.expectNone((p) => p.method === 'GET');
  });

  it('un 409 `seccion-modificada` recarga la lista, avisa y permite reintentar con la marca nueva', async () => {
    const montada = await abrir();
    const { fixture, control } = montada;
    await editarSaludo(montada, 'Mi versión.');

    boton('Guardar').click();
    await asentar(fixture);
    control.expectOne((p) => p.method === 'PATCH').flush(...problema('seccion-modificada', 'otra persona la cambió', 409));
    await asentar(fixture);
    atenderLecturas(
      control,
      lista([seccion('s-1', 'Saludo', 0, { actualizado: '2026-10-09T10:00:00.000Z' }), seccion('s-2', 'Formato', 1)]),
    );
    await asentar(fixture);

    const dialogo = document.querySelector('mat-dialog-container')!.textContent;
    expect(dialogo).toContain('otra persona');
    expect(dialogo).toContain('vuelve a guardar');
    expect(document.querySelector<HTMLTextAreaElement>('[data-campo="texto"]')!.value).toBe('Mi versión.');

    boton('Guardar').click();
    await asentar(fixture);
    const reintento = control.expectOne((p) => p.method === 'PATCH');
    expect(reintento.request.body).toMatchObject({ actualizado: '2026-10-09T10:00:00.000Z', texto: 'Mi versión.' });
  });

  it('subir y bajar mandan el orden completo; la primera no sube y la última no baja', async () => {
    const { fixture, control } = await abrir();

    expect(porEtiqueta('Subir Saludo').disabled).toBe(true);
    expect(porEtiqueta('Bajar Cierre').disabled).toBe(true);

    porEtiqueta('Bajar Saludo').click();
    await asentar(fixture);

    const peticion = control.expectOne((p) => p.method === 'PUT' && p.url === URL_ORDEN);
    expect(peticion.request.body).toEqual({ ids: ['s-2', 's-1', 's-3'] });
    peticion.flush(lista([seccion('s-2', 'Formato', 0), seccion('s-1', 'Saludo', 1), seccion('s-3', 'Cierre', 2, { activo: false })]));
    await asentar(fixture);

    const titulos = [...document.querySelectorAll('[data-seccion] strong')].map((t) => t.textContent);
    expect(titulos).toEqual(['Formato', 'Saludo', 'Cierre']);
  });

  it('un 422 al encender recarga la lista para que el interruptor vuelva al estado del servidor y dice el motivo', async () => {
    const { fixture, control, el } = await abrir();

    document.querySelectorAll<HTMLElement>('[data-seccion] button[role="switch"]')[2]!.click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'PATCH' && p.url === `${URL_SECCIONES}/s-3`)
      .flush(...problema('estilo-invalido', 'superaría el tope de caracteres', 422));
    await asentar(fixture);
    atenderLecturas(control);
    await asentar(fixture);

    expect(el.textContent).toContain('superaría el tope de caracteres');
    const interruptor = document.querySelectorAll<HTMLElement>('[data-seccion] button[role="switch"]')[2]!;
    expect(interruptor.getAttribute('aria-checked')).toBe('false');
  });

  it('ordenar vuelve a leer la versión vigente y el historial, porque el servidor publica una versión nueva', async () => {
    const { fixture, control } = await abrir();

    porEtiqueta('Bajar Saludo').click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'PUT' && p.url === URL_ORDEN)
      .flush(lista([seccion('s-2', 'Formato', 0), seccion('s-1', 'Saludo', 1), seccion('s-3', 'Cierre', 2, { activo: false })]));
    await asentar(fixture);
    atenderLecturas(
      control,
      lista([seccion('s-2', 'Formato', 0), seccion('s-1', 'Saludo', 1), seccion('s-3', 'Cierre', 2, { activo: false })]),
      { ...VIGENTE, version: 4 },
    );
    await asentar(fixture);

    expect(document.querySelector('.vigente')!.textContent).toContain('Versión 4');
  });

  it('un 409 `seccion-modificada` con la recarga caída conserva el conflicto original en la ventana', async () => {
    const montada = await abrir();
    const { fixture, control } = montada;
    await editarSaludo(montada, 'Mi versión.');

    boton('Guardar').click();
    await asentar(fixture);
    control.expectOne((p) => p.method === 'PATCH').flush(...problema('seccion-modificada', 'otra persona la cambió', 409));
    await asentar(fixture);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_ESTILO).flush(...problema('caido', 'sin conexión', 503));
    control.expectOne((p) => p.method === 'GET' && p.url === URL_HISTORIAL).flush(HISTORIAL);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_SECCIONES).flush(lista());
    await asentar(fixture);

    const dialogo = document.querySelector('mat-dialog-container')!.textContent;
    expect(dialogo).toContain('otra persona');
    expect(dialogo).not.toContain('sin conexión');
  });

  it('un rechazo al ordenar muestra el motivo del servidor', async () => {
    const { fixture, control, el } = await abrir();

    porEtiqueta('Bajar Saludo').click();
    await asentar(fixture);
    control.expectOne((p) => p.method === 'PUT').flush(...problema('orden-secciones-invalido', 'faltan secciones', 422));
    await asentar(fixture);

    expect(el.textContent).toContain('faltan secciones');
  });

  it('El historial muestra quién publicó cada versión, o «Comando» si no tiene usuario', async () => {
    const { el } = await abrir();

    const filas = [...el.querySelectorAll('tr.mat-mdc-row')].map((fila) => fila.textContent ?? '');
    expect(filas[0]).toContain('Luis');
    expect(filas[1]).toContain('Comando');
  });

  it('El historial lista versión, fecha y un extracto, y permite ver el texto completo', async () => {
    const { fixture, el } = await abrir();

    expect(el.textContent).toContain('03/10/2026');
    expect(el.textContent).not.toContain('Estilo dos. '.repeat(30));

    boton('Ver texto').click();
    await asentar(fixture);

    expect(el.textContent).toContain('Estilo dos. '.repeat(30).trim());
  });

  it('Restaurar pide confirmación, reemplaza las secciones y recarga la lista', async () => {
    const { fixture, control, el } = await abrir();

    const restaurar = [...el.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent?.trim() === 'Restaurar');
    restaurar[1]!.click(); // la versión 1
    await asentar(fixture);
    boton('Confirmar').click();
    await asentar(fixture);

    const peticion = control.expectOne((p) => p.method === 'POST' && p.url === `${URL_ESTILO}/restauraciones`);
    expect(peticion.request.body).toEqual({ version: 1 });
    peticion.flush({ version: 5 });
    await asentar(fixture);
    atenderLecturas(control, lista([seccion('s-9', 'Restaurada', 0)]), { ...VIGENTE, version: 5 });
    await asentar(fixture);

    expect(el.textContent).toContain('Versión 5');
    expect(el.textContent).toContain('Restaurada');
    expect(el.textContent).toContain('evals reales');
  });

  it('remite a «Casos de uso» para lo que responde el bot', async () => {
    const { el } = await abrir();

    expect(el.textContent).toContain('«Casos de uso»');
  });
});
