import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TarjetaElementoComponent } from './tarjeta-elemento.component';

@Component({
  imports: [TarjetaElementoComponent],
  template: `
    <app-tarjeta-elemento [titulo]="titulo" [etiquetas]="etiquetas" [vista]="vista" [clicable]="clicable"
      [atenuada]="atenuada" [variante]="variante" [conteo]="conteo" [titulos]="titulos" (abrir)="abiertas = abiertas + 1">
      <button type="button" acciones data-prueba="editar">Editar</button>
    </app-tarjeta-elemento>
  `,
})
class AnfitrionComponent {
  titulo = 'Saludo';
  etiquetas: readonly string[] = [];
  vista: string | null = null;
  clicable = false;
  atenuada = false;
  variante: 'elemento' | 'categoria' = 'elemento';
  conteo: number | null = null;
  titulos: readonly string[] = [];
  abiertas = 0;
}

async function montar(cambios: Partial<AnfitrionComponent> = {}) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(AnfitrionComponent);
  Object.assign(fixture.componentInstance, cambios);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, tarjeta: el.querySelector('app-tarjeta-elemento') as HTMLElement };
}

describe('Tarjeta de elemento', () => {
  it('muestra título, etiquetas y vista previa, y proyecta las acciones', async () => {
    const { el } = await montar({ etiquetas: ['Sistema', 'Guía'], vista: 'Hola, ¿en qué te ayudo?' });

    expect(el.querySelector('h3')!.textContent).toContain('Saludo');
    expect(Array.from(el.querySelectorAll('[data-etiqueta]')).map((e) => e.textContent)).toEqual(['Sistema', 'Guía']);
    expect(el.querySelector('[data-vista]')!.textContent).toBe('Hola, ¿en qué te ayudo?');
    expect(el.querySelector('[data-prueba="editar"]')).not.toBeNull();
  });

  it('sin etiquetas ni vista no dibuja esos bloques', async () => {
    const { el } = await montar();

    expect(el.querySelector('[data-etiqueta]')).toBeNull();
    expect(el.querySelector('[data-vista]')).toBeNull();
  });

  it('no clicable: el título no es un botón', async () => {
    const { el } = await montar();

    expect(el.querySelector('button[data-accion="abrir"]')).toBeNull();
  });

  it('clicable: el título es un botón nativo (teclado) que emite abrir', async () => {
    const { fixture, el } = await montar({ clicable: true });

    const abrir = el.querySelector<HTMLButtonElement>('button[data-accion="abrir"]')!;
    expect(abrir.tagName).toBe('BUTTON');
    expect(abrir.tabIndex).toBe(0);
    abrir.click();

    expect(fixture.componentInstance.abiertas).toBe(1);
  });

  it('una acción de la ranura no abre la tarjeta', async () => {
    const { fixture, el } = await montar({ clicable: true });

    el.querySelector<HTMLButtonElement>('[data-prueba="editar"]')!.click();

    expect(fixture.componentInstance.abiertas).toBe(0);
  });

  it('inactiva: queda atenuada', async () => {
    const { tarjeta } = await montar({ atenuada: true });

    expect(tarjeta.classList).toContain('atenuada');
  });

  it('variante categoría: muestra el conteo y los primeros títulos en lugar de la vista', async () => {
    const { el, tarjeta } = await montar({
      variante: 'categoria',
      conteo: 4,
      titulos: ['Saludo', 'Envíos', 'Precios'],
      vista: 'no se muestra',
    });

    expect(tarjeta.getAttribute('data-variante')).toBe('categoria');
    expect(el.querySelector('[data-conteo]')!.textContent).toBe('4');
    expect(Array.from(el.querySelectorAll('[data-titulos] li')).map((e) => e.textContent)).toEqual([
      'Saludo',
      'Envíos',
      'Precios',
    ]);
    expect(el.querySelector('[data-vista]')).toBeNull();
  });
});
