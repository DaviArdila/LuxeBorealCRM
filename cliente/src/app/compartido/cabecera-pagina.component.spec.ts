import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { AvisoComponent, type TipoDeAviso } from './aviso.component';
import { CabeceraPaginaComponent } from './cabecera-pagina.component';

@Component({
  imports: [AvisoComponent, CabeceraPaginaComponent],
  template: `
    <app-cabecera-pagina titulo="Casos de uso" [ayuda]="ayuda()">
      <button type="button" data-prueba="accion">Nuevo</button>
      @for (aviso of avisos(); track $index) {
        <app-aviso [tipo]="aviso" [flotante]="true">Aviso de {{ aviso }}</app-aviso>
      }
    </app-cabecera-pagina>
  `,
})
class AnfitrionComponent {
  readonly ayuda = signal<string | null>('Aquí se editan las respuestas del bot.');
  readonly avisos = signal<readonly TipoDeAviso[]>([]);
}

async function montar(ayuda: string | null = 'Aquí se editan las respuestas del bot.', avisos: readonly TipoDeAviso[] = []) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.componentInstance.ayuda.set(ayuda);
  fixture.componentInstance.avisos.set(avisos);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const boton = () => el.querySelector<HTMLButtonElement>('button[data-accion="ayuda-avisos"]');
  const pulsar = async (): Promise<void> => {
    boton()!.click();
    await fixture.whenStable();
  };
  return { fixture, el, boton, pulsar };
}

describe('Cabecera de página', () => {
  it('muestra el título como h1 y proyecta las acciones', async () => {
    const { el } = await montar();

    expect(el.querySelector('h1')!.textContent).toBe('Casos de uso');
    expect(el.querySelector('[data-prueba="accion"]')!.textContent).toBe('Nuevo');
  });

  it('no hay ícono de ayuda junto al título: un solo botón «Ayuda y avisos» al final de las acciones', async () => {
    const { fixture, el, boton } = await montar();

    expect(el.querySelector('.titulo button')).toBeNull();
    expect(el.querySelector('button[data-accion="ayuda"]')).toBeNull();
    const acciones = el.querySelector('.acciones')!;
    expect(acciones.lastElementChild!.contains(boton())).toBe(true);
    expect(boton()!.getAttribute('aria-label')).toBe('Ayuda y avisos');
    const globo = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(globo.message).toBe('Ayuda y avisos');
  });

  it('pulsar el botón abre y cierra el panel con el texto de ayuda', async () => {
    const { el, boton, pulsar } = await montar();
    expect(el.querySelector('[data-ayuda]')).toBeNull();
    expect(boton()!.getAttribute('aria-expanded')).toBe('false');

    await pulsar();
    expect(el.querySelector('[data-ayuda]')!.textContent).toContain('Aquí se editan las respuestas del bot.');
    expect(boton()!.getAttribute('aria-expanded')).toBe('true');

    await pulsar();
    expect(el.querySelector('[data-ayuda]')).toBeNull();
  });

  it('Escape cierra el panel', async () => {
    const { fixture, el, pulsar } = await montar();
    await pulsar();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(el.querySelector('[data-ayuda]')).toBeNull();
  });

  it('sin ayuda ni avisos no hay botón', async () => {
    const { boton } = await montar(null);

    expect(boton()).toBeNull();
  });

  it('los avisos viven en la zona de la cabecera, el botón cuenta cuántos hay y toma el tono del más grave', async () => {
    const { el, boton } = await montar(null, ['info', 'error', 'advertencia']);

    expect(el.querySelectorAll('[data-zona-avisos] app-aviso')).toHaveLength(3);
    expect(boton()).not.toBeNull();
    expect(el.querySelector('[data-insignia]')!.textContent.trim()).toBe('3');
    expect(boton()!.getAttribute('data-tono')).toBe('error');
    expect(boton()!.getAttribute('aria-label')).toBe('Ayuda y avisos (3 avisos)');
  });

  it('con solo una advertencia el tono es de advertencia; sin avisos no hay insignia ni tono', async () => {
    const advertencia = await montar('Ayuda', ['advertencia']);
    expect(advertencia.boton()!.getAttribute('data-tono')).toBe('advertencia');

    TestBed.resetTestingModule();
    const limpio = await montar('Ayuda', []);
    expect(limpio.el.querySelector('[data-insignia]')).toBeNull();
    expect(limpio.boton()!.hasAttribute('data-tono')).toBe(false);
  });

  it('con el panel abierto la zona muestra todos los avisos, también los plegados', async () => {
    const { el, pulsar } = await montar('Ayuda', ['error']);
    const zona = el.querySelector('[data-zona-avisos]')!;
    expect(zona.classList).not.toContain('abierta');

    await pulsar();

    expect(zona.classList).toContain('abierta');
    expect(zona.querySelector('app-aviso')!.classList).toContain('en-panel');
  });
});
