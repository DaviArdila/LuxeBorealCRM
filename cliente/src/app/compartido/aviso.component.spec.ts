import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AvisoComponent, type TipoDeAviso } from './aviso.component';

function montar(tipo: TipoDeAviso, descartable = false) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(AvisoComponent);
  fixture.componentRef.setInput('tipo', tipo);
  fixture.componentRef.setInput('descartable', descartable);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Aviso en línea', () => {
  it('un error se anuncia de inmediato y la información sin interrumpir', async () => {
    const error = montar('error');
    await error.fixture.whenStable();
    expect(error.el.getAttribute('role')).toBe('alert');

    TestBed.resetTestingModule();
    const info = montar('info');
    await info.fixture.whenStable();
    expect(info.el.getAttribute('role')).toBe('status');
  });

  it('sin descartable no ofrece cerrarlo', async () => {
    const { fixture, el } = montar('advertencia');
    await fixture.whenStable();

    expect(el.querySelector('button')).toBeNull();
  });

  it('descartable emite descartar al pulsar «Cerrar aviso»', async () => {
    const { fixture, el } = montar('advertencia', true);
    const descartados: number[] = [];
    fixture.componentInstance.descartar.subscribe(() => descartados.push(1));
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>('button[aria-label="Cerrar aviso"]')!.click();

    expect(descartados).toEqual([1]);
  });
});

describe('Aviso flotante', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function montarFlotante(tipo: TipoDeAviso, segundos = 5) {
    const { fixture, el } = montar(tipo);
    fixture.componentRef.setInput('flotante', true);
    fixture.componentRef.setInput('segundos', segundos);
    fixture.detectChanges();
    return { fixture, el };
  }

  it('aparece abierto con su mensaje y se ancla a la esquina', () => {
    const { el } = montarFlotante('advertencia');

    expect(el.classList).toContain('flotante');
    expect(el.classList).not.toContain('plegado');
    expect(el.querySelector('[data-accion="mostrar-aviso"]')).toBeNull();
  });

  it('tras los segundos indicados se pliega a un ícono con nombre accesible', () => {
    const { fixture, el } = montarFlotante('error', 5);

    vi.advanceTimersByTime(4999);
    fixture.detectChanges();
    expect(el.classList).not.toContain('plegado');

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    const icono = el.querySelector<HTMLButtonElement>('[data-accion="mostrar-aviso"]')!;
    expect(el.classList).toContain('plegado');
    expect(icono.getAttribute('aria-label')).toBe('Mostrar aviso de error');
    expect(el.querySelector('.insignia')).not.toBeNull();
    expect(el.getAttribute('role')).toBe('alert');
  });

  it('un error plegado no desaparece solo, por mucho que pase el tiempo', () => {
    const { fixture, el } = montarFlotante('error', 1);

    vi.advanceTimersByTime(600_000);
    fixture.detectChanges();

    expect(el.querySelector('[data-accion="mostrar-aviso"]')).not.toBeNull();
  });

  it('al pulsar el ícono se reabre y vuelve a plegarse después', () => {
    const { fixture, el } = montarFlotante('info', 3);
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('[data-accion="mostrar-aviso"]')!.click();
    fixture.detectChanges();
    expect(el.classList).not.toContain('plegado');
    expect(el.querySelector('[data-accion="mostrar-aviso"]')).toBeNull();

    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(el.classList).toContain('plegado');
  });

  it('sin flotante nunca se pliega', () => {
    const { fixture, el } = montar('info');
    fixture.detectChanges();

    vi.advanceTimersByTime(600_000);
    fixture.detectChanges();

    expect(el.classList).not.toContain('flotante');
    expect(el.querySelector('[data-accion="mostrar-aviso"]')).toBeNull();
  });
});
