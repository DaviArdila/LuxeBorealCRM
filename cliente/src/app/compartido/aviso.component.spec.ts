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
