import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideApiMismoOrigen } from '../../../nucleo/configuracion-api';
import { CasosComponent } from './casos.component';

const URL_CASOS = '/api/v1/asistente/casos';
const URL_CATEGORIAS = '/api/v1/asistente/categorias';

const CATEGORIAS = {
  categorias: [
    { id: 'c-1', nombre: 'Sistema', orden: 1, totalCasos: 1 },
    { id: 'c-2', nombre: 'Políticas', orden: 2, totalCasos: 2 },
    { id: 'c-3', nombre: 'Vacía', orden: 3, totalCasos: 0 },
  ],
};

function caso(sobre: Record<string, unknown> = {}) {
  return {
    id: 'k-1',
    categoriaId: 'c-2',
    categoriaNombre: 'Políticas',
    titulo: 'Garantía',
    cuandoAplica: 'Cuando preguntan por la garantía',
    texto: 'La garantía es de un año.',
    modo: 'literal',
    disparador: 'intencion',
    claveSistema: null,
    activo: true,
    creado: '2026-10-01T10:00:00.000Z',
    actualizado: '2026-10-02T10:00:00.000Z',
    ...sobre,
  };
}

const HANDOFF = caso({
  id: 'k-0',
  categoriaId: 'c-1',
  categoriaNombre: 'Sistema',
  titulo: 'Traspaso a un asesor',
  cuandoAplica: 'Cuando el bot pasa la conversación a un asesor',
  disparador: 'evento',
  claveSistema: 'mensaje_handoff',
});
const CASOS = {
  items: [HANDOFF, caso(), caso({ id: 'k-2', titulo: 'Devoluciones', activo: false })],
  siguienteCursor: null,
};

async function montar() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideApiMismoOrigen()],
  });
  const control = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CasosComponent);
  await asentar(fixture);
  return { fixture, control, el: fixture.nativeElement as HTMLElement };
}

async function asentar(fixture: ComponentFixture<CasosComponent>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  await fixture.whenStable();
}

function esperar(milisegundos: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, milisegundos));
}

/** La animación de cierre de Material no tiene duración fija en jsdom: se espera por tiempo, no por vueltas. */
async function cerrada(fixture: ComponentFixture<CasosComponent>): Promise<void> {
  const limite = Date.now() + 3000;
  while (document.querySelector('mat-dialog-container') && Date.now() < limite) {
    await esperar(20);
    await fixture.whenStable();
  }
}

function listaDeCasos(control: HttpTestingController): TestRequest {
  return control.expectOne((p) => p.method === 'GET' && p.url === URL_CASOS);
}

/** Atiende las dos lecturas con las que la pantalla se abre. */
async function abrir(casos: object = CASOS, categorias: object = CATEGORIAS) {
  const montada = await montar();
  montada.control.expectOne((p) => p.method === 'GET' && p.url === URL_CATEGORIAS).flush(categorias);
  listaDeCasos(montada.control).flush(casos);
  await asentar(montada.fixture);
  return montada;
}

function boton(texto: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;
}

function botonConEtiqueta(etiqueta: string): HTMLButtonElement | undefined {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${etiqueta}"]`) ?? undefined;
}

function escribir(campo: string, texto: string): void {
  const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-campo="${campo}"]`)!;
  control.value = texto;
  control.dispatchEvent(new Event('input'));
}

describe('SHL10 — Pantalla «Casos de uso»', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('SHL10 — Los casos se agrupan por categoría con su contador', async () => {
    const { el } = await abrir();

    const grupos = [...el.querySelectorAll('[data-categoria]')].map((g) => g.textContent ?? '');
    expect(grupos[0]).toContain('Sistema');
    expect(grupos[0]).toContain('(1)');
    expect(grupos[0]).toContain('Traspaso a un asesor');
    expect(grupos[1]).toContain('Políticas');
    expect(grupos[1]).toContain('(2)');
    expect(grupos[1]).toContain('Garantía');
    expect(grupos[1]).toContain('Devoluciones');
  });

  it('SHL10 — El buscador llama al servidor con retardo y muestra solo lo que responde', async () => {
    const { fixture, control, el } = await abrir();
    const buscador = el.querySelector<HTMLInputElement>('[data-campo="buscar"]')!;

    buscador.value = 'garan';
    buscador.dispatchEvent(new Event('input'));
    await esperar(100);
    control.expectNone((p) => p.method === 'GET' && p.url === URL_CASOS);
    await esperar(300);

    const busqueda = listaDeCasos(control);
    expect(busqueda.request.params.get('q')).toBe('garan');
    busqueda.flush({ items: [caso()], siguienteCursor: null });
    await asentar(fixture);
    expect(el.textContent).toContain('Garantía');
    expect(el.textContent).not.toContain('Devoluciones');
  });

  it('SHL10 — Crear un caso desde la ventana llama a crearCaso, la cierra y lo muestra en su categoría', async () => {
    const { fixture, control, el } = await abrir();

    boton('Nuevo caso').click();
    await asentar(fixture);
    escribir('titulo', 'Medios de pago');
    escribir('cuando-aplica', 'Cuando preguntan cómo pagar');
    escribir('texto', 'Aceptamos transferencia.');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);

    const creacion = control.expectOne((p) => p.method === 'POST' && p.url === URL_CASOS);
    expect(creacion.request.body).toMatchObject({
      categoriaId: 'c-1',
      titulo: 'Medios de pago',
      cuandoAplica: 'Cuando preguntan cómo pagar',
      texto: 'Aceptamos transferencia.',
      modo: 'literal',
    });
    creacion.flush(caso({ id: 'k-9', titulo: 'Medios de pago', categoriaId: 'c-1', categoriaNombre: 'Sistema' }), { status: 201, statusText: 'Created' });
    await asentar(fixture);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_CATEGORIAS).flush(CATEGORIAS);
    listaDeCasos(control).flush({ items: [HANDOFF, caso({ id: 'k-9', titulo: 'Medios de pago', categoriaId: 'c-1', categoriaNombre: 'Sistema' })], siguienteCursor: null });
    await asentar(fixture);
    await cerrada(fixture);

    expect(document.querySelector('mat-dialog-container')).toBeNull();
    expect(el.querySelector('[data-categoria]')!.textContent).toContain('Medios de pago');
  });

  it('SHL10 — Un rechazo del servidor queda dentro de la ventana y conserva lo escrito', async () => {
    const { fixture, control } = await abrir();

    boton('Nuevo caso').click();
    await asentar(fixture);
    escribir('titulo', 'Precios');
    escribir('cuando-aplica', 'Cuando preguntan');
    escribir('texto', 'Cuesta $50.000.');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'POST' && p.url === URL_CASOS)
      .flush({ codigo: 'caso-invalido', title: 'El caso no cumple', detail: 'el texto contiene un valor en pesos' }, { status: 422, statusText: 'x' });
    await asentar(fixture);

    expect(document.querySelector('mat-dialog-container')!.textContent).toContain('el texto contiene un valor en pesos');
    expect(document.querySelector<HTMLTextAreaElement>('[data-campo="texto"]')!.value).toBe('Cuesta $50.000.');
  });

  it('SHL10 — «Editar» abre la ventana con el caso y guarda con la fecha de actualización', async () => {
    const { fixture, control } = await abrir();

    document.querySelector<HTMLButtonElement>('button[aria-label="Editar Garantía"]')!.click();
    await asentar(fixture);
    expect(document.querySelector<HTMLInputElement>('[data-campo="titulo"]')!.value).toBe('Garantía');
    escribir('texto', 'La garantía es de dos años.');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);

    const edicion = control.expectOne((p) => p.method === 'PATCH' && p.url === `${URL_CASOS}/k-1`);
    expect(edicion.request.body).toMatchObject({ actualizado: '2026-10-02T10:00:00.000Z', texto: 'La garantía es de dos años.' });
  });

  it('SHL10 — Un caso del sistema tiene la etiqueta «Sistema» y su descripción, sin borrar ni desactivar', async () => {
    const { fixture, el } = await abrir();

    const grupo = el.querySelector('[data-categoria]')!;
    expect(grupo.textContent).toContain('Sistema');
    expect(grupo.textContent).toContain('Cuando el bot pasa la conversación a un asesor');
    expect(botonConEtiqueta('Borrar Traspaso a un asesor')).toBeUndefined();
    expect(botonConEtiqueta('Borrar Garantía')).toBeDefined();

    botonConEtiqueta('Editar Traspaso a un asesor')!.click();
    await asentar(fixture);
    expect(document.querySelector('[data-campo="activo"]')).toBeNull();
  });

  it('SHL10 — Una categoría con casos no se borra: la pantalla muestra el motivo y la categoría sigue', async () => {
    const { fixture, control, el } = await abrir();

    botonConEtiqueta('Borrar categoría Políticas')!.click();
    await asentar(fixture);
    boton('Confirmar').click();
    await asentar(fixture);
    control
      .expectOne((p) => p.method === 'DELETE' && p.url === `${URL_CATEGORIAS}/c-2`)
      .flush({ codigo: 'categoria-con-casos', title: 'La categoría tiene casos', detail: 'mueve o borra sus casos primero' }, { status: 409, statusText: 'x' });
    await asentar(fixture);

    expect(el.textContent).toContain('mueve o borra sus casos primero');
    expect(el.querySelector('[data-categorias]')!.textContent).toContain('Políticas');
  });

  it('SHL10 — Se pueden crear, renombrar y reordenar categorías', async () => {
    const { fixture, control } = await abrir();

    boton('Nueva categoría').click();
    await asentar(fixture);
    escribir('nombre-categoria', 'Envíos');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);
    const creada = control.expectOne((p) => p.method === 'POST' && p.url === URL_CATEGORIAS);
    expect(creada.request.body).toEqual({ nombre: 'Envíos' });
    creada.flush({ id: 'c-4', nombre: 'Envíos', orden: 4, totalCasos: 0 }, { status: 201, statusText: 'Created' });
    await asentar(fixture);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_CATEGORIAS).flush(CATEGORIAS);
    listaDeCasos(control).flush(CASOS);
    await asentar(fixture);
    await cerrada(fixture);

    botonConEtiqueta('Renombrar categoría Políticas')!.click();
    await asentar(fixture);
    escribir('nombre-categoria', 'Políticas de la tienda');
    await asentar(fixture);
    boton('Guardar').click();
    await asentar(fixture);
    const renombrada = control.expectOne((p) => p.method === 'PATCH' && p.url === `${URL_CATEGORIAS}/c-2`);
    expect(renombrada.request.body).toEqual({ nombre: 'Políticas de la tienda' });
    renombrada.flush({ id: 'c-2', nombre: 'Políticas de la tienda', orden: 2, totalCasos: 2 });
    await asentar(fixture);
    control.expectOne((p) => p.method === 'GET' && p.url === URL_CATEGORIAS).flush(CATEGORIAS);
    listaDeCasos(control).flush(CASOS);
    await asentar(fixture);
    await cerrada(fixture);

    botonConEtiqueta('Subir categoría Políticas')!.click();
    await asentar(fixture);
    const orden = control.expectOne((p) => p.method === 'PUT' && p.url === `${URL_CATEGORIAS}/orden`);
    expect(orden.request.body).toEqual({ ids: ['c-2', 'c-1', 'c-3'] });
  });

  it('SHL10 — Un caso inactivo se ve atenuado con la etiqueta «Inactivo»', async () => {
    const { el } = await abrir();

    const fila = [...el.querySelectorAll('[data-caso]')].find((f) => f.textContent?.includes('Devoluciones'))!;
    expect(fila.classList.contains('inactivo')).toBe(true);
    expect(fila.textContent).toContain('Inactivo');
    const activa = [...el.querySelectorAll('[data-caso]')].find((f) => f.textContent?.includes('Garantía'))!;
    expect(activa.classList.contains('inactivo')).toBe(false);
  });

  it('SHL10 — Sin casos muestra un estado vacío con la acción de crear', async () => {
    const { el } = await abrir({ items: [], siguienteCursor: null }, { categorias: [] });

    expect(el.textContent).toContain('No hay casos');
    expect(el.querySelector('[data-vacio]')!.textContent).toContain('Nuevo caso');
  });
});
