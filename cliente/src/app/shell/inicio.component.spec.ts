import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SesionServicio } from '../nucleo/sesion.servicio';
import { InicioComponent } from './inicio.component';

describe('Inicio', () => {
  it('saluda con la cabecera de página y sugiere elegir una pantalla del menú', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(SesionServicio).usuario.set({ id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' });
    const fixture = TestBed.createComponent(InicioComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-cabecera-pagina h1')!.textContent).toBe('Hola, Ana');
    expect(el.textContent).toContain('Elige una pantalla del menú.');
  });
});
