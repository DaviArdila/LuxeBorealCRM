import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogoEdicionComponent } from './dialogo-edicion.component';
import { EditorConContadorComponent } from './editor-con-contador.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogoEdicionComponent, EditorConContadorComponent],
  template: `
    <button type="button" id="editar" (click)="abierta.set(true)">Editar</button>
    <app-dialogo-edicion titulo="Editar valor" [(abierta)]="abierta" [hayCambios]="borrador() !== original"
                         [alGuardar]="guardar" [mensajeDeError]="motivo" [etiquetaGuardar]="etiqueta"
                         [mensajeConfirmacion]="confirmacion">
      <app-editor-con-contador etiqueta="Valor" [maximo]="10" [(texto)]="borrador" />
    </app-dialogo-edicion>
  `,
})
class AnfitrionComponent {
  readonly original = 'valor actual';
  readonly abierta = signal(false);
  readonly borrador = signal(this.original);
  etiqueta = 'Guardar';
  confirmacion: string | null = null;
  guardados: string[] = [];
  falla: Error | null = null;
  readonly guardar = async (): Promise<void> => {
    if (this.falla) throw this.falla;
    this.guardados.push(this.borrador());
  };
  readonly motivo = (error: unknown): string => (error as Error).message;
}

async function montar(ajuste: (a: AnfitrionComponent) => void = () => undefined) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(AnfitrionComponent);
  ajuste(fixture.componentInstance);
  await fixture.whenStable();
  return fixture;
}

async function asentar(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver, 20));
  await fixture.whenStable();
}

/** La animación de cierre de Material tarda unos ms incluso en jsdom: se espera a la condición. */
async function hasta(condicion: () => boolean, fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  for (let intento = 0; intento < 50 && !condicion(); intento++) await asentar(fixture);
}

function boton(texto: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;
}

function ventana(): HTMLElement | null {
  return document.querySelector('mat-dialog-container');
}

function escribir(texto: string): void {
  const area = document.querySelector('textarea')!;
  area.value = texto;
  area.dispatchEvent(new Event('input'));
}

describe('SHL8 — Editar siempre abre una ventana emergente', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('SHL8 — Editar abre la ventana con el valor actual', async () => {
    const fixture = await montar();
    expect(ventana()).toBeNull();

    boton('Editar').click();
    await asentar(fixture);

    expect(ventana()).not.toBeNull();
    expect(ventana()!.textContent).toContain('Editar valor');
    expect(document.querySelector('textarea')!.value).toBe('valor actual');
    expect(ventana()!.textContent).toContain('12 / 10');
  });

  it('SHL8 — Un error del servidor se muestra dentro de la ventana sin perder lo escrito', async () => {
    const fixture = await montar((a) => (a.falla = new Error('contiene un valor en pesos')));
    boton('Editar').click();
    await asentar(fixture);
    escribir('texto nuevo');
    await asentar(fixture);

    boton('Guardar').click();
    await asentar(fixture);

    expect(ventana()).not.toBeNull();
    expect(ventana()!.textContent).toContain('contiene un valor en pesos');
    expect(document.querySelector('textarea')!.value).toBe('texto nuevo');
  });

  it('SHL8 — Guardar con éxito cierra la ventana y refresca', async () => {
    const fixture = await montar();
    boton('Editar').click();
    await asentar(fixture);
    escribir('texto nuevo');
    await asentar(fixture);

    boton('Guardar').click();
    await asentar(fixture);

    expect(fixture.componentInstance.guardados).toEqual(['texto nuevo']);
    await hasta(() => ventana() === null, fixture);
    expect(ventana()).toBeNull();
    expect(fixture.componentInstance.abierta()).toBe(false);
  });

  it('SHL8 — Cerrar con cambios sin guardar pide confirmación', async () => {
    const fixture = await montar();
    boton('Editar').click();
    await asentar(fixture);
    escribir('cambiado');
    await asentar(fixture);

    ventana()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await asentar(fixture);

    expect(document.body.textContent).toContain('¿Descartarlos?');
    expect(document.querySelector('textarea')).not.toBeNull();

    boton('Confirmar').click();
    await hasta(() => ventana() === null, fixture);

    expect(ventana()).toBeNull();
    expect(fixture.componentInstance.guardados).toEqual([]);
  });

  it('SHL8 — Cerrar sin cambios no pregunta', async () => {
    const fixture = await montar();
    boton('Editar').click();
    await asentar(fixture);

    boton('Cancelar').click();
    await asentar(fixture);

    await hasta(() => ventana() === null, fixture);
    expect(document.body.textContent).not.toContain('¿Descartarlos?');
    expect(ventana()).toBeNull();
  });

  it('SHL8 — El foco entra a la ventana y vuelve al botón', async () => {
    const fixture = await montar();
    const editar = boton('Editar');
    editar.focus();

    editar.click();
    await hasta(() => ventana()?.contains(document.activeElement) === true, fixture);
    expect(ventana()!.contains(document.activeElement)).toBe(true);

    boton('Cancelar').click();
    await hasta(() => document.activeElement === editar, fixture);

    expect(document.activeElement).toBe(editar);
  });

  it('con confirmación previa, guardar pregunta antes y solo guarda al confirmar', async () => {
    const fixture = await montar((a) => {
      a.etiqueta = 'Publicar';
      a.confirmacion = '¿Publicar este texto?';
    });
    boton('Editar').click();
    await asentar(fixture);
    escribir('texto nuevo');
    await asentar(fixture);

    boton('Publicar').click();
    await asentar(fixture);
    expect(document.body.textContent).toContain('¿Publicar este texto?');
    expect(fixture.componentInstance.guardados).toEqual([]);

    boton('Confirmar').click();
    await asentar(fixture);

    expect(fixture.componentInstance.guardados).toEqual(['texto nuevo']);
    await hasta(() => ventana() === null, fixture);
    expect(ventana()).toBeNull();
  });
});
