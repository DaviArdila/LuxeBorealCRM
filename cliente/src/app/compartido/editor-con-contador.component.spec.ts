import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EditorConContadorComponent } from './editor-con-contador.component';

function montar(texto: string, maximo = 4000) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(EditorConContadorComponent);
  fixture.componentRef.setInput('etiqueta', 'Texto');
  fixture.componentRef.setInput('maximo', maximo);
  fixture.componentRef.setInput('texto', texto);
  return fixture;
}

describe('CLT7/CLT8 — El editor con contador muestra los caracteres sobre el máximo', () => {
  it('muestra el texto y el contador', async () => {
    const fixture = montar('Hola');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('textarea')!.value).toBe('Hola');
    expect(el.textContent).toContain('4 / 4000');
  });

  it('al escribir actualiza el modelo y el contador', async () => {
    const fixture = montar('');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const area = el.querySelector('textarea')!;
    area.value = 'Buenos días';
    area.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(fixture.componentInstance.texto()).toBe('Buenos días');
    expect(el.textContent).toContain('11 / 4000');
  });

  it('marca el contador cuando se pasa del máximo, sin impedir escribir (la regla es del servidor)', async () => {
    const fixture = montar('x'.repeat(12), 10);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-contador]')!.classList.contains('excedido')).toBe(true);
    expect(el.querySelector('textarea')!.maxLength).toBe(-1);
  });
});
