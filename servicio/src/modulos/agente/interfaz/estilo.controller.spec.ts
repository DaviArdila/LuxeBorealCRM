import { describe, expect, it } from 'vitest';
import type { PerfilUsuario } from '../../usuarios/index.js';
import type { ListarHistorialEstilo } from '../aplicacion/listar-historial-estilo.js';
import type { ProveedorEstilo } from '../aplicacion/proveedor-estilo.js';
import type { PublicarEstilo, ResultadoPublicacion } from '../aplicacion/publicar-estilo.js';
import type { RestaurarEstilo } from '../aplicacion/restaurar-estilo.js';
import { EstiloController } from './estilo.controller.js';

// AGT23 (T2): el controlador solo traduce los resultados de los casos de uso a respuestas HTTP y errores de catálogo.

const admin: PerfilUsuario = { id: '0199a000-0000-7000-8000-000000000001', nombre: 'Dueño', email: 'a@b.co', rol: 'admin' };

function crear(opciones: {
  readonly vigente?: { texto: string; version: number; origen: 'base' | 'archivo' };
  readonly historial?: { version: number; texto: string; fecha: string }[];
  readonly publicacion?: ResultadoPublicacion;
} = {}) {
  const llamadas: string[] = [];
  const proveedor = {
    obtener: () => Promise.resolve(opciones.vigente ?? { texto: 'Estilo del archivo', version: 0, origen: 'archivo' as const }),
  } as Pick<ProveedorEstilo, 'obtener'>;
  const listar = {
    ejecutar: () => Promise.resolve({ vigente: null, historial: opciones.historial ?? [] }),
  } as Pick<ListarHistorialEstilo, 'ejecutar'>;
  const publicar = {
    ejecutar: (texto: string) => {
      llamadas.push(`publicar:${texto}`);
      return Promise.resolve(opciones.publicacion ?? { publicado: true as const, version: 4 });
    },
  } as Pick<PublicarEstilo, 'ejecutar'>;
  const restaurar = {
    ejecutar: (version: number) => {
      llamadas.push(`restaurar:${String(version)}`);
      return Promise.resolve(opciones.publicacion ?? { publicado: true as const, version: 4 });
    },
  } as Pick<RestaurarEstilo, 'ejecutar'>;
  const controlador = new EstiloController(
    proveedor as ProveedorEstilo,
    listar as ListarHistorialEstilo,
    publicar as PublicarEstilo,
    restaurar as RestaurarEstilo,
  );
  return { controlador, llamadas };
}

describe('EstiloController (AGT23)', () => {
  it('AGT23 — Un admin consulta el estilo vigente: versión, origen y texto', async () => {
    const { controlador } = crear({ vigente: { texto: 'Estilo tres', version: 3, origen: 'base' } });

    await expect(controlador.obtenerEstilo()).resolves.toEqual({ version: 3, origen: 'base', texto: 'Estilo tres' });
  });

  it('AGT23 — Sin estilo publicado la versión es null y el origen es archivo', async () => {
    const { controlador } = crear();

    await expect(controlador.obtenerEstilo()).resolves.toEqual({ version: null, origen: 'archivo', texto: 'Estilo del archivo' });
  });

  it('el historial se entrega con versión, fecha y texto, en el orden del caso de uso', async () => {
    const historial = [
      { version: 2, texto: 'Dos', fecha: '2026-10-02T10:00:00.000Z' },
      { version: 1, texto: 'Uno', fecha: '2026-10-01T10:00:00.000Z' },
    ];
    const { controlador } = crear({ historial });

    await expect(controlador.listarHistorialEstilo()).resolves.toEqual({ versiones: historial });
  });

  it('publicar entrega la versión nueva', async () => {
    const { controlador, llamadas } = crear();

    await expect(controlador.publicarEstilo({ texto: 'Estilo nuevo' }, admin)).resolves.toEqual({ version: 4 });
    expect(llamadas).toEqual(['publicar:Estilo nuevo']);
  });

  it('AGT23 — Un estilo inválido responde estilo-invalido con el motivo en el detalle', async () => {
    const { controlador } = crear({ publicacion: { publicado: false, motivo: 'el estilo contiene un valor en pesos (R1, R2)', razon: 'invalido' } });

    await expect(controlador.publicarEstilo({ texto: 'Cuesta $ 5' }, admin)).rejects.toMatchObject({
      codigo: 'estilo-invalido',
      detalle: 'el estilo contiene un valor en pesos (R1, R2)',
    });
  });

  it('AGT23 — Restaurar entrega la versión nueva', async () => {
    const { controlador, llamadas } = crear();

    await expect(controlador.restaurarEstilo({ version: 1 }, admin)).resolves.toEqual({ version: 4 });
    expect(llamadas).toEqual(['restaurar:1']);
  });

  it('AGT23 — Restaurar una versión que no existe responde version-estilo-inexistente', async () => {
    const { controlador } = crear({ publicacion: { publicado: false, motivo: 'la versión 9 no está en el historial', razon: 'version-inexistente' } });

    await expect(controlador.restaurarEstilo({ version: 9 }, admin)).rejects.toMatchObject({
      codigo: 'version-estilo-inexistente',
      detalle: 'la versión 9 no está en el historial',
    });
  });

  it('restaurar una versión cuyo texto hoy sería inválido responde estilo-invalido', async () => {
    const { controlador } = crear({ publicacion: { publicado: false, motivo: 'el estilo contiene un SKU (AGT16)', razon: 'invalido' } });

    await expect(controlador.restaurarEstilo({ version: 1 }, admin)).rejects.toMatchObject({ codigo: 'estilo-invalido' });
  });
});
