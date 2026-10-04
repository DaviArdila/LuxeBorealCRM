import { describe, expect, it } from 'vitest';
import { AlmacenSesionesEnMemoria } from '../../../../test/fakes/almacen-sesiones-en-memoria.js';
import { CerrarSesion } from './cerrar-sesion.js';

// USR4: cerrar sesión borra la sesión al instante y es idempotente (T4).

const sesion = { usuarioId: 'u', creada: new Date(0), ultimaActividad: new Date(0) };

describe('CerrarSesion (USR4)', () => {
  it('borra la sesión indicada y deja las demás', async () => {
    const sesiones = new AlmacenSesionesEnMemoria();
    sesiones.sesiones.set('sesion-a', sesion);
    sesiones.sesiones.set('sesion-b', sesion);

    await new CerrarSesion(sesiones).ejecutar('sesion-a');

    expect([...sesiones.sesiones.keys()]).toEqual(['sesion-b']);
  });

  it('sin sesión o con una sesión que ya no existe no falla', async () => {
    const caso = new CerrarSesion(new AlmacenSesionesEnMemoria());

    await expect(caso.ejecutar(undefined)).resolves.toBeUndefined();
    await expect(caso.ejecutar('sesion-inexistente')).resolves.toBeUndefined();
  });
});
