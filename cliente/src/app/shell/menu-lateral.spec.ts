import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AREAS_REGISTRADAS } from '../nucleo/areas.token';
import type { DefinicionArea } from '../nucleo/definicion-area';
import { provideApiMismoOrigen } from '../nucleo/configuracion-api';
import { SesionServicio, type Usuario } from '../nucleo/sesion.servicio';
import { ShellComponent } from './shell.component';

const ASISTENTE: DefinicionArea = {
  id: 'asistente',
  titulo: 'Asistente',
  icono: 'forum',
  roles: ['admin'],
  menu: [
    {
      titulo: 'Asistente',
      icono: 'forum',
      roles: ['admin'],
      hijos: [
        { titulo: 'Casos de uso', ruta: '/asistente/casos', roles: ['admin'] },
        { titulo: 'Estilo del bot', ruta: '/asistente/estilo', roles: ['admin'] },
      ],
    },
  ],
  rutas: () => Promise.resolve([]),
};
const CONFIGURACION: DefinicionArea = {
  id: 'configuracion',
  titulo: 'Configuración',
  icono: 'settings',
  roles: ['admin'],
  menu: [
    {
      titulo: 'Configuración',
      icono: 'settings',
      roles: ['admin'],
      hijos: [{ titulo: 'Horario', ruta: '/configuracion/horario', roles: ['admin'] }],
    },
  ],
  rutas: () => Promise.resolve([]),
};
const PRUEBA: DefinicionArea = {
  id: 'prueba',
  titulo: 'Prueba',
  icono: 'star',
  roles: ['admin', 'asesor'],
  menu: [{ titulo: 'Pantalla de prueba', icono: 'star', ruta: '/prueba/uno', roles: ['admin', 'asesor'] }],
  rutas: () => Promise.resolve([]),
};
const MIXTA: DefinicionArea = {
  id: 'mixta',
  titulo: 'Mixta',
  icono: 'groups',
  roles: ['admin', 'asesor'],
  menu: [
    {
      titulo: 'Equipo',
      icono: 'groups',
      roles: ['admin', 'asesor'],
      hijos: [
        { titulo: 'Mis leads', ruta: '/mixta/leads', roles: ['admin', 'asesor'] },
        { titulo: 'Usuarios', ruta: '/mixta/usuarios', roles: ['admin'] },
      ],
    },
  ],
  rutas: () => Promise.resolve([]),
};
const ADMIN: Usuario = { id: 'u1', email: 'a@luxe.co', nombre: 'Ana', rol: 'admin' };
const ASESOR: Usuario = { id: 'u2', email: 'b@luxe.co', nombre: 'Beto', rol: 'asesor' };
const RUTAS = [
  { path: 'entrar', children: [] },
  { path: 'asistente', children: [{ path: 'casos', children: [] }, { path: 'estilo', children: [] }] },
  { path: 'prueba', children: [{ path: 'uno', children: [] }] },
];

/** jsdom no trae `matchMedia`: se simula el ancho de un teléfono (D10). */
function simularTelefono(): void {
  window.matchMedia = ((consulta: string) => ({
    matches: consulta.includes('640px'),
    media: consulta,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

interface Opciones {
  readonly url?: string;
  readonly telefono?: boolean;
}

async function preparar(usuario: Usuario, areas: readonly DefinicionArea[], opciones: Opciones = {}) {
  if (opciones.telefono === true) simularTelefono();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(RUTAS),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiMismoOrigen(),
      { provide: AREAS_REGISTRADAS, useValue: areas },
    ],
  });
  TestBed.inject(SesionServicio).usuario.set(usuario);
  if (opciones.url !== undefined) await TestBed.inject(Router).navigateByUrl(opciones.url);
  const fixture = TestBed.createComponent(ShellComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const pulsar = async (selector: string): Promise<void> => {
    el.querySelector<HTMLElement>(selector)!.click();
    await fixture.whenStable();
  };
  return { fixture, el, pulsar, control: TestBed.inject(HttpTestingController) };
}

const grupo = (nombre: string) => `button[data-grupo="${nombre}"]`;
const enlaces = (el: HTMLElement) => Array.from(el.querySelectorAll('a[data-entrada]')).map((a) => a.textContent.trim());

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  // @ts-expect-error: se retira la simulación de `matchMedia` de las pruebas de teléfono.
  delete window.matchMedia;
});

describe('SHL1 — El menú lateral se arma desde el registro de áreas y admite submódulos', () => {
  it('SHL1 — Un grupo con submódulos se despliega y se pliega', async () => {
    const { el, pulsar } = await preparar(ADMIN, [ASISTENTE]);
    expect(enlaces(el)).toEqual([]);

    await pulsar(grupo('Asistente'));
    expect(enlaces(el)).toEqual(['Casos de uso', 'Estilo del bot']);

    await pulsar(grupo('Asistente'));
    expect(enlaces(el)).toEqual([]);
  });

  it('SHL1 — Una entrada sin hijos navega directo', async () => {
    const { el, pulsar } = await preparar(ADMIN, [PRUEBA]);

    expect(el.querySelector('button[data-grupo]')).toBeNull();
    await pulsar('a[data-entrada]');
    await new Promise((resolver) => setTimeout(resolver));

    expect(TestBed.inject(Router).url).toBe('/prueba/uno');
  });

  it('SHL1 — Un área nueva con submódulos aparece sin tocar el shell', async () => {
    const nueva: DefinicionArea = { ...MIXTA, id: 'nueva', titulo: 'Nueva' };
    const { el, pulsar } = await preparar(ADMIN, [nueva]);

    await pulsar(grupo('Equipo'));

    expect(enlaces(el)).toEqual(['Mis leads', 'Usuarios']);
  });
});

describe('SHL2 — El menú marca dónde está el usuario', () => {
  it('SHL2 — La entrada activa se resalta', async () => {
    const { el } = await preparar(ADMIN, [ASISTENTE], { url: '/asistente/casos' });

    const casos = el.querySelector('a[data-entrada="/asistente/casos"]')!;
    expect(casos.getAttribute('aria-current')).toBe('page');
    expect(casos.classList).toContain('activa');
    expect(el.querySelector('a[data-entrada="/asistente/estilo"]')!.getAttribute('aria-current')).toBeNull();
  });

  it('SHL2 — El grupo de la ruta activa carga desplegado', async () => {
    const { el } = await preparar(ADMIN, [ASISTENTE], { url: '/asistente/estilo' });

    expect(el.querySelector(grupo('Asistente'))!.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('SHL3 — El menú oculta lo que el rol no puede usar, también en los submódulos', () => {
  it('SHL3 — Un asesor no ve los grupos de admin', async () => {
    const { el } = await preparar(ASESOR, [ASISTENTE, CONFIGURACION, PRUEBA]);

    expect(el.querySelector(grupo('Asistente'))).toBeNull();
    expect(el.querySelector(grupo('Configuración'))).toBeNull();
    expect(enlaces(el)).toEqual(['Pantalla de prueba']);
  });

  it('SHL3 — Un grupo con un solo hijo permitido muestra solo ese hijo', async () => {
    const { el, pulsar } = await preparar(ASESOR, [MIXTA]);

    await pulsar(grupo('Equipo'));

    expect(enlaces(el)).toEqual(['Mis leads']);
  });
});

describe('SHL4 — El menú es un riel que se expande al pasar el mouse', () => {
  it('SHL4 — No hay botón de compactar ni preferencia guardada', async () => {
    const { el, pulsar } = await preparar(ADMIN, [PRUEBA]);

    expect(el.querySelector('button[data-accion="compactar"]')).toBeNull();
    expect(el.textContent).not.toContain('Compactar menú');
    expect(el.querySelector('nav')!.hasAttribute('data-compacto')).toBe(false);
    await pulsar('a[data-entrada]');
    expect(localStorage.getItem('luxe.menu.compacto')).toBeNull();
  });

  it('SHL4 — Cada entrada lleva su nombre accesible aunque el riel solo muestre el ícono', async () => {
    const { el } = await preparar(ADMIN, [PRUEBA]);

    const entrada = el.querySelector('a[data-entrada]')!;
    expect(entrada.getAttribute('aria-label')).toBe('Pantalla de prueba');
    expect(entrada.textContent).toContain('Pantalla de prueba');
  });

  it('SHL4 — En un escritorio el riel se marca para que el CSS lo expanda al hover y al foco', async () => {
    const { el } = await preparar(ADMIN, [PRUEBA]);

    expect(el.querySelector('app-menu-lateral')!.classList).toContain('riel');
  });

  it('SHL4 — El logo está al tope del menú y lleva al inicio', async () => {
    const { el } = await preparar(ADMIN, [PRUEBA]);

    const marca = el.querySelector<HTMLAnchorElement>('app-menu-lateral a.marca')!;
    expect(marca.textContent).toContain('LuxeBoreal');
    expect(marca.getAttribute('href')).toBe('/');
  });

  it('SHL4 — En un escritorio no hay barra superior', async () => {
    const { el } = await preparar(ADMIN, [PRUEBA]);

    expect(el.querySelector('mat-toolbar')).toBeNull();
  });
});

describe('SHL5 — En un teléfono el menú es un cajón', () => {
  it('SHL5 — El cajón está cerrado al cargar en un teléfono', async () => {
    const { el } = await preparar(ADMIN, [PRUEBA], { telefono: true });

    expect(el.querySelector('mat-sidenav')!.classList).not.toContain('mat-drawer-opened');
    expect(el.querySelector('button[data-accion="abrir-menu"]')).not.toBeNull();
  });

  it('SHL5 — En un teléfono queda una barra mínima con hamburguesa y logo, y el menú no es riel', async () => {
    const { el } = await preparar(ADMIN, [PRUEBA], { telefono: true });

    const barra = el.querySelector('mat-toolbar')!;
    expect(barra.querySelector('button[data-accion="abrir-menu"]')).not.toBeNull();
    expect(barra.querySelector('a.marca')!.textContent).toContain('LuxeBoreal');
    expect(el.querySelector('app-menu-lateral')!.classList).not.toContain('riel');
    expect(el.querySelector('app-menu-lateral a.marca')).toBeNull();
  });

  it('SHL5 — En un escritorio el menú está abierto y no hay botón de cajón', async () => {
    const { el } = await preparar(ADMIN, [PRUEBA]);

    expect(el.querySelector('mat-sidenav')!.classList).toContain('mat-drawer-opened');
    expect(el.querySelector('button[data-accion="abrir-menu"]')).toBeNull();
  });

  it('SHL5 — Navegar cierra el cajón', async () => {
    const { el, pulsar } = await preparar(ADMIN, [PRUEBA], { telefono: true });
    await pulsar('button[data-accion="abrir-menu"]');
    expect(el.querySelector('mat-sidenav')!.classList).toContain('mat-drawer-opened');

    await pulsar('a[data-entrada]');
    await new Promise((resolver) => setTimeout(resolver));

    expect(TestBed.inject(Router).url).toBe('/prueba/uno');
    expect(el.querySelector('mat-sidenav')!.classList).not.toContain('mat-drawer-opened');
  });
});

describe('SHL6 — El pie del menú muestra al usuario y permite cerrar sesión', () => {
  it('SHL6 — El pie muestra nombre y rol', async () => {
    const { el } = await preparar(ADMIN, [PRUEBA]);

    const pie = el.querySelector('[data-pie]')!;
    expect(pie.textContent).toContain('Ana');
    expect(pie.textContent).toContain('admin');
  });

  it('SHL6 — Cerrar sesión desde el pie', async () => {
    const { pulsar, control } = await preparar(ADMIN, [PRUEBA]);

    await pulsar('[data-pie] button[data-accion="cerrar-sesion"]');
    const peticion = control.expectOne('/api/v1/auth/sesion');
    expect(peticion.request.method).toBe('DELETE');
    peticion.flush(null, { status: 204, statusText: 'x' });
    await new Promise((resolver) => setTimeout(resolver));

    expect(TestBed.inject(Router).url).toBe('/entrar');
  });
});

describe('SHL7 — El menú se maneja con teclado', () => {
  it('SHL7 — Un grupo se despliega con el teclado', async () => {
    const { el, pulsar } = await preparar(ADMIN, [ASISTENTE]);
    const boton = el.querySelector<HTMLButtonElement>(grupo('Asistente'))!;

    expect(boton.tagName).toBe('BUTTON');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    await pulsar(grupo('Asistente'));

    expect(boton.getAttribute('aria-expanded')).toBe('true');
  });

  it('SHL7 — Las entradas se alcanzan con Tab', async () => {
    const { el, pulsar } = await preparar(ADMIN, [ASISTENTE, PRUEBA]);
    await pulsar(grupo('Asistente'));

    const alcanzables = Array.from(el.querySelectorAll<HTMLElement>('nav a, nav button'));

    expect(alcanzables.map((nodo) => nodo.textContent.trim())).toEqual(
      expect.arrayContaining(['Asistente', 'Casos de uso', 'Estilo del bot', 'Pantalla de prueba']),
    );
    for (const nodo of alcanzables) expect(nodo.tabIndex).toBeGreaterThanOrEqual(0);
  });
});
