import { describe, expect, it } from 'vitest';
import type { ObtenerNombreProducto } from '../../catalogo/index.js';
import type { ResolverEnlaceConversacion } from '../../notificaciones/index.js';
import type { Lead } from '../dominio/lead.js';
import { ArmarDatosAvisoLead } from './armar-datos-aviso-lead.js';

const LEAD: Lead = {
  id: 'lead-1',
  contactoId: 'contacto-1',
  conversacionId: 'conv-1',
  productoId: 'p1',
  temperatura: 'caliente',
  senales: ['pide_pagar'],
  resumen: 'Quiere pagar la regadera.',
  derivado: true,
  capturadoFueraHorario: false,
  estado: 'nuevo',
  notificadoEn: null,
  recordatorioEn: null,
};

const ENLACE = 'https://chat.ejemplo.co/app/accounts/1/conversations/2';

function armar(opciones: { enlace?: string | undefined; producto?: string | null | Error } = {}) {
  const llamadas: string[] = [];
  const resolver = {
    ejecutar: (conversacionId: string | null) => {
      llamadas.push(`enlace:${conversacionId}`);
      return Promise.resolve(opciones.enlace);
    },
  } as unknown as ResolverEnlaceConversacion;
  const producto = {
    ejecutar: (id: string) => {
      llamadas.push(`producto:${id}`);
      const valor = opciones.producto === undefined ? 'Regadera fija con brazo' : opciones.producto;
      return valor instanceof Error ? Promise.reject(valor) : Promise.resolve(valor);
    },
  } as unknown as ObtenerNombreProducto;
  return { caso: new ArmarDatosAvisoLead(resolver, producto), llamadas };
}

describe('ArmarDatosAvisoLead (NTF1, NTF5)', () => {
  it('NTF1 — arma los datos del aviso con el producto por su nombre y el enlace', async () => {
    const { caso } = armar({ enlace: ENLACE });

    await expect(caso.ejecutar(LEAD, 'lead')).resolves.toEqual({
      tipo: 'lead',
      temperatura: 'caliente',
      senales: ['pide_pagar'],
      resumen: 'Quiere pagar la regadera.',
      capturadoFueraHorario: false,
      producto: 'Regadera fija con brazo',
      enlace: ENLACE,
    });
  });

  it('el recordatorio usa el mismo armado con su propio tipo', async () => {
    const { caso } = armar({ enlace: ENLACE });

    await expect(caso.ejecutar(LEAD, 'recordatorio')).resolves.toMatchObject({ tipo: 'recordatorio', enlace: ENLACE });
  });

  it('NTF5 — sin enlace el aviso sale sin la propiedad, no con undefined', async () => {
    const { caso } = armar({ enlace: undefined });

    const datos = await caso.ejecutar(LEAD, 'lead');

    expect('enlace' in datos).toBe(false);
  });

  it('un lead sin producto no consulta el catálogo y no lleva producto', async () => {
    const { caso, llamadas } = armar({ enlace: ENLACE });

    const datos = await caso.ejecutar({ ...LEAD, productoId: null }, 'lead');

    expect('producto' in datos).toBe(false);
    expect(llamadas.some((llamada) => llamada.startsWith('producto:'))).toBe(false);
  });

  it('un producto que ya no existe se omite sin romper el aviso', async () => {
    const { caso } = armar({ enlace: ENLACE, producto: null });

    const datos = await caso.ejecutar(LEAD, 'lead');

    expect('producto' in datos).toBe(false);
  });

  it('si el catálogo falla el aviso sale igual, sin producto', async () => {
    const { caso } = armar({ enlace: ENLACE, producto: new Error('catálogo caído') });

    await expect(caso.ejecutar(LEAD, 'lead')).resolves.toMatchObject({ tipo: 'lead', enlace: ENLACE });
  });

  it('un lead sin conversación pide el enlace con null', async () => {
    const { caso, llamadas } = armar({ enlace: undefined });

    await caso.ejecutar({ ...LEAD, conversacionId: null }, 'lead');

    expect(llamadas).toContain('enlace:null');
  });
});
