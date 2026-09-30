import { RepositorioContactoAgenteEnMemoria } from '../../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { crearGuardarDatosContacto } from './guardar-datos-contacto.js';

// Escenarios AGT10 de `openspec/changes/fase-07b-agente-llm-herramientas/specs/agente/spec.md`.

const CONTEXTO = { sesion: { conversacionId: 'conv-1', version: 0 }, contactoId: 'contacto-7', efectosPrevios: [] };
const DATOS = {
  nombre_completo: 'Laura Gómez Pérez',
  telefono_contacto: '3001234567',
  direccion: 'Calle 45 # 12-34 apto 301',
  localidad: 'Chapinero',
};

describe('modulos/agente/aplicacion/herramientas — guardar_datos_contacto', () => {
  it('AGT10 — Los datos quedan guardados en el contacto de la conversación', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    const resultado = await crearGuardarDatosContacto(repositorio).ejecutar(DATOS, CONTEXTO);

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

    await crearGuardarDatosContacto(repositorio).ejecutar({ ...DATOS, telefono_contacto: 'este mismo' }, CONTEXTO);

    expect(repositorio.guardados.get('contacto-7')?.telefonoAlterno).toBeNull();
  });

  it('un teléfono con menos de 7 dígitos tampoco se guarda', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    await crearGuardarDatosContacto(repositorio).ejecutar({ ...DATOS, telefono_contacto: '123 45' }, CONTEXTO);

    expect(repositorio.guardados.get('contacto-7')?.telefonoAlterno).toBeNull();
  });

  it('el contacto sale del contexto de la conversación, nunca de los argumentos del modelo', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    await crearGuardarDatosContacto(repositorio).ejecutar(
      { ...DATOS, contacto_id: 'otro-contacto' },
      CONTEXTO,
    );

    expect([...repositorio.guardados.keys()]).toEqual(['contacto-7']);
  });

  it('su definición exige los cuatro campos', () => {
    const { definicion } = crearGuardarDatosContacto(new RepositorioContactoAgenteEnMemoria());

    expect(definicion.nombre).toBe('guardar_datos_contacto');
    expect(definicion.esquema.safeParse(DATOS).success).toBe(true);
    expect(definicion.esquema.safeParse({ ...DATOS, direccion: undefined }).success).toBe(false);
  });
});
