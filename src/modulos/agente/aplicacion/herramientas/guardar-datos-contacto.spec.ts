import { RepositorioContactoAgenteEnMemoria } from '../../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import type { CapturaLead } from '../../puertos/captura-lead.js';
import { crearGuardarDatosContacto } from './guardar-datos-contacto.js';

// Escenarios AGT10 de `openspec/changes/archive/2026-09-30-fase-07b-agente-llm-herramientas/specs/agente/spec.md`.

const CONTEXTO = { sesion: { conversacionId: 'conv-1', version: 0 }, contactoId: 'contacto-7', efectosPrevios: [] };
const SIN_CAPTURA: CapturaLead = { pendiente: () => Promise.resolve(false), completar: () => Promise.resolve() };
const DATOS = {
  nombre_completo: 'Laura Gómez Pérez',
  telefono_contacto: '3001234567',
  direccion: 'Calle 45 # 12-34 apto 301',
  localidad: 'Chapinero',
};

describe('modulos/agente/aplicacion/herramientas — guardar_datos_contacto', () => {
  it('AGT10 — Los datos quedan guardados en el contacto de la conversación', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    const resultado = await crearGuardarDatosContacto(repositorio, SIN_CAPTURA).ejecutar(DATOS, CONTEXTO);

    expect(repositorio.guardados.get('contacto-7')).toEqual({
      nombre: 'Laura Gómez Pérez',
      telefonoAlterno: '3001234567',
      direccion: 'Calle 45 # 12-34 apto 301',
      localidad: 'Chapinero',
    });
    expect(resultado.paraElModelo).toEqual({ guardado: true });
    expect(resultado.efectos).toEqual([{ tipo: 'datos-contacto-guardados' }]);
  });

  it('AGT10 — Este mismo número no se guarda como teléfono alterno', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    await crearGuardarDatosContacto(repositorio, SIN_CAPTURA).ejecutar({ ...DATOS, telefono_contacto: 'este mismo' }, CONTEXTO);

    expect(repositorio.guardados.get('contacto-7')?.telefonoAlterno).toBeNull();
  });

  it('un teléfono con menos de 7 dígitos tampoco se guarda', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    await crearGuardarDatosContacto(repositorio, SIN_CAPTURA).ejecutar({ ...DATOS, telefono_contacto: '123 45' }, CONTEXTO);

    expect(repositorio.guardados.get('contacto-7')?.telefonoAlterno).toBeNull();
  });

  it('el contacto sale del contexto de la conversación, nunca de los argumentos del modelo', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    await crearGuardarDatosContacto(repositorio, SIN_CAPTURA).ejecutar(
      { ...DATOS, contacto_id: 'otro-contacto' },
      CONTEXTO,
    );

    expect([...repositorio.guardados.keys()]).toEqual(['contacto-7']);
  });

  it('su definición exige los cuatro campos', () => {
    const { definicion } = crearGuardarDatosContacto(new RepositorioContactoAgenteEnMemoria(), SIN_CAPTURA);

    expect(definicion.nombre).toBe('guardar_datos_contacto');
    expect(definicion.esquema.safeParse(DATOS).success).toBe(true);
    expect(definicion.esquema.safeParse({ ...DATOS, direccion: undefined }).success).toBe(false);
  });

  it('LDS4 — Con los datos guardados el lead queda capturado: completa la captura de la conversación', async () => {
    const completadas: string[] = [];
    const captura: CapturaLead = {
      pendiente: () => Promise.resolve(true),
      completar: (conversacionId) => {
        completadas.push(conversacionId);
        return Promise.resolve();
      },
    };

    await crearGuardarDatosContacto(new RepositorioContactoAgenteEnMemoria(), captura).ejecutar(DATOS, CONTEXTO);

    expect(completadas).toEqual(['conv-1']);
  });

  it('si completar la captura falla, los datos ya quedaron guardados y el modelo igual recibe guardado', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    const captura: CapturaLead = { pendiente: () => Promise.resolve(true), completar: () => Promise.reject(new Error('lead caído')) };

    const resultado = await crearGuardarDatosContacto(repositorio, captura).ejecutar(DATOS, CONTEXTO);

    expect(repositorio.guardados.has('contacto-7')).toBe(true);
    expect(resultado.paraElModelo).toEqual({ guardado: true });
  });
});
