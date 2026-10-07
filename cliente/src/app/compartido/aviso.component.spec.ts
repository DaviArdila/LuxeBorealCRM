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

describe('Aviso flotante (mensaje breve que se pliega en la cabecera)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function montarFlotante(tipo: TipoDeAviso, segundos = 5) {
    const { fixture, el } = montar(tipo, true);
    fixture.componentRef.setInput('flotante', true);
    fixture.componentRef.setInput('segundos', segundos);
    fixture.detectChanges();
    return { fixture, el };
  }

  it('aparece abierto con su mensaje', () => {
    const { el } = montarFlotante('advertencia');

    expect(el.classList).toContain('flotante');
    expect(el.classList).not.toContain('plegado');
  });

  it('tras los segundos indicados se pliega (la cabecera lo guarda en su botón), sin íconos propios en la esquina', () => {
    const { fixture, el } = montarFlotante('error', 5);

    vi.advanceTimersByTime(4999);
    fixture.detectChanges();
    expect(el.classList).not.toContain('plegado');

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(el.classList).toContain('plegado');
    expect(el.querySelector('[data-accion="mostrar-aviso"]')).toBeNull();
    expect(el.getAttribute('role')).toBe('alert');
  });

  it('un error plegado no desaparece solo: sigue con su mensaje y su «Cerrar aviso» hasta que alguien lo descarte', () => {
    const { fixture, el } = montarFlotante('error', 1);

    vi.advanceTimersByTime(600_000);
    fixture.detectChanges();

    expect(el.textContent).toBeDefined();
    expect(el.querySelector('button[aria-label="Cerrar aviso"]')).not.toBeNull();
  });

  it('sin flotante nunca se pliega', () => {
    const { fixture, el } = montar('info');
    fixture.detectChanges();

    vi.advanceTimersByTime(600_000);
    fixture.detectChanges();

    expect(el.classList).not.toContain('flotante');
    expect(el.classList).not.toContain('plegado');
  });
});
