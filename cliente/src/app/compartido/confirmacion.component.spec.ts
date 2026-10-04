import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmacionComponent } from './confirmacion.component';

function montar() {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(ConfirmacionComponent);
  fixture.componentRef.setInput('titulo', 'Publicar estilo');
  fixture.componentRef.setInput('mensaje', '¿Publicar el estilo nuevo?');
  return fixture;
}

function boton(texto: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(texto))!;
}

describe('CLT7 — La confirmación pide confirmar antes de actuar', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('cerrada no muestra nada', async () => {
    const fixture = montar();
    await fixture.whenStable();

    expect(document.body.textContent).not.toContain('¿Publicar el estilo nuevo?');
  });

  it('abierta muestra el mensaje y «Confirmar» emite confirmar y se cierra', async () => {
    const fixture = montar();
    const confirmadas: number[] = [];
    fixture.componentInstance.confirmar.subscribe(() => confirmadas.push(1));
    fixture.componentRef.setInput('abierta', true);
    await fixture.whenStable();

    expect(document.body.textContent).toContain('¿Publicar el estilo nuevo?');
    boton('Confirmar').click();
    await fixture.whenStable();

    expect(confirmadas).toEqual([1]);
    expect(fixture.componentInstance.abierta()).toBe(false);
  });

  it('«Cancelar» se cierra sin emitir confirmar', async () => {
    const fixture = montar();
    const confirmadas: number[] = [];
    fixture.componentInstance.confirmar.subscribe(() => confirmadas.push(1));
    fixture.componentRef.setInput('abierta', true);
    await fixture.whenStable();

    boton('Cancelar').click();
    await fixture.whenStable();

    expect(confirmadas).toEqual([]);
    expect(fixture.componentInstance.abierta()).toBe(false);
  });
});
