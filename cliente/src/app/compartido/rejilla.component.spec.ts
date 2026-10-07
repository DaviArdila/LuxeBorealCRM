import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RejillaComponent } from './rejilla.component';

@Component({
  imports: [RejillaComponent],
  template: `<app-rejilla [minimo]="minimo"><p>uno</p><p>dos</p></app-rejilla>`,
})
class AnfitrionComponent {
  minimo: string | null = null;
}

async function montar(minimo: string | null) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.componentInstance.minimo = minimo;
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).querySelector('app-rejilla') as HTMLElement;
}

describe('Rejilla', () => {
  it('proyecta sus hijos como celdas de la rejilla', async () => {
    const rejilla = await montar(null);

    expect(rejilla.querySelectorAll('p')).toHaveLength(2);
  });

  it('por defecto lee el ancho mínimo del token global', async () => {
    const rejilla = await montar(null);

    expect(rejilla.style.getPropertyValue('--luxe-rejilla-min')).toBe('');
  });

  it('un mínimo propio reemplaza el token solo para esa rejilla', async () => {
    const rejilla = await montar('22rem');

    expect(rejilla.style.getPropertyValue('--luxe-rejilla-min')).toBe('22rem');
  });
});
