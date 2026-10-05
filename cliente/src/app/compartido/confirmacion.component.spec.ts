import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
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

/** Diálogo falso cuyo `afterClosed` decide el test: así el fin de la animación de cierre es determinista. */
class DialogoDoble {
  readonly abiertos: { cerrado: boolean; terminarCierre: () => void }[] = [];

  open(): MatDialogRef<unknown> {
    const fin = new Subject<void>();
    const abierto = {
      cerrado: false,
      terminarCierre: () => {
        fin.next();
        fin.complete();
      },
    };
    this.abiertos.push(abierto);
    return {
      afterClosed: () => fin.asObservable(),
      close: () => (abierto.cerrado = true),
    } as unknown as MatDialogRef<unknown>;
  }
}

function montarConDoble() {
  const dialogos = new DialogoDoble();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: MatDialog, useValue: dialogos }],
  });
  const fixture = TestBed.createComponent(ConfirmacionComponent);
  fixture.componentRef.setInput('titulo', 'Publicar estilo');
  fixture.componentRef.setInput('mensaje', '¿Publicar el estilo nuevo?');
  return { fixture, dialogos };
}

describe('CLT7 — La confirmación sigue el cierre real del diálogo', () => {
  it('cerrar con Escape o con el fondo equivale a «Cancelar»', async () => {
    const { fixture, dialogos } = montarConDoble();
    const confirmadas: number[] = [];
    fixture.componentInstance.confirmar.subscribe(() => confirmadas.push(1));
    fixture.componentRef.setInput('abierta', true);
    await fixture.whenStable();

    dialogos.abiertos[0].terminarCierre();
    await fixture.whenStable();

    expect(confirmadas).toEqual([]);
    expect(fixture.componentInstance.abierta()).toBe(false);
  });

  it('el cierre tardío de un diálogo anterior no cierra el que se reabrió', async () => {
    const { fixture, dialogos } = montarConDoble();
    fixture.componentRef.setInput('abierta', true);
    await fixture.whenStable();
    fixture.componentRef.setInput('abierta', false);
    await fixture.whenStable();
    fixture.componentRef.setInput('abierta', true);
    await fixture.whenStable();
    expect(dialogos.abiertos).toHaveLength(2);

    dialogos.abiertos[0].terminarCierre();
    await fixture.whenStable();

    expect(fixture.componentInstance.abierta()).toBe(true);
    expect(dialogos.abiertos[1].cerrado).toBe(false);
  });
});
