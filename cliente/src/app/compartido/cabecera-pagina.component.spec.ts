import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { CabeceraPaginaComponent } from './cabecera-pagina.component';

@Component({
  imports: [CabeceraPaginaComponent],
  template: `
    <app-cabecera-pagina titulo="Casos de uso" [ayuda]="ayuda">
      <button type="button" data-prueba="accion">Nuevo</button>
    </app-cabecera-pagina>
  `,
})
class AnfitrionComponent {
  ayuda: string | null = 'Aquí se editan las respuestas del bot.';
}

async function montar(ayuda: string | null = 'Aquí se editan las respuestas del bot.') {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.componentInstance.ayuda = ayuda;
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Cabecera de página', () => {
  it('muestra el título como h1 y proyecta las acciones', async () => {
    const { el } = await montar();

    expect(el.querySelector('h1')!.textContent).toBe('Casos de uso');
    expect(el.querySelector('[data-prueba="accion"]')!.textContent).toBe('Nuevo');
  });

  it('el ícono de ayuda lleva el texto explicativo en su globo y un nombre accesible', async () => {
    const { fixture, el } = await montar();

    const boton = el.querySelector<HTMLButtonElement>('button[data-accion="ayuda"]')!;
    const globo = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(boton.getAttribute('aria-label')).toBe('Ayuda sobre Casos de uso');
    expect(globo.message).toBe('Aquí se editan las respuestas del bot.');
  });

  it('pulsar el ícono alterna el globo (táctil)', async () => {
    const { fixture, el } = await montar();
    const globo = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    const alternar = vi.spyOn(globo, 'toggle');

    el.querySelector<HTMLButtonElement>('button[data-accion="ayuda"]')!.click();

    expect(alternar).toHaveBeenCalledTimes(1);
  });

  it('sin texto de ayuda no hay ícono', async () => {
    const { el } = await montar(null);

    expect(el.querySelector('button[data-accion="ayuda"]')).toBeNull();
  });
});
