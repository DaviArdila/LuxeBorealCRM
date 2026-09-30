import { ProductoNoDisponible, type ObtenerFichaProducto } from '../../../catalogo/index.js';
import type { EvaluarPropuestaLead, EntradaPropuesta } from '../../../leads/index.js';
import { EvaluadorLeadDeLeads } from './evaluador-lead-de-leads.js';

const CTX = { sesion: { conversacionId: 'conv-1', version: 0 }, contactoId: 'contacto-1', efectosPrevios: [] };

function crear(ficha: (id: string) => Promise<{ id: string }>) {
  const entradas: EntradaPropuesta[] = [];
  const leads = {
    ejecutar: (entrada: EntradaPropuesta) => {
      entradas.push(entrada);
      return Promise.resolve({ derivado: true, accion: 'derivar', leadId: 'lead-1' });
    },
  } as unknown as EvaluarPropuestaLead;
  const adaptador = new EvaluadorLeadDeLeads(leads, { ejecutar: ficha } as unknown as ObtenerFichaProducto);
  return { adaptador, entradas };
}

describe('modulos/agente/infraestructura — EvaluadorLeadDeLeads (D2)', () => {
  it('traduce la propuesta del modelo a la entrada de leads con la conversación y el contacto del contexto', async () => {
    const { adaptador, entradas } = crear((id) => Promise.resolve({ id: `uuid-de-${id}` }));

    const resultado = await adaptador.evaluar(
      { temperatura: 'caliente', senales: ['pide_pagar'], resumen: 'quiere pagar', productoId: 'SKU-1' },
      CTX,
    );

    expect(entradas).toEqual([
      {
        conversacionId: 'conv-1',
        contactoId: 'contacto-1',
        temperatura: 'caliente',
        senales: ['pide_pagar'],
        resumen: 'quiere pagar',
        productoId: 'uuid-de-SKU-1',
      },
    ]);
    expect(resultado).toEqual({ derivado: true, accion: 'derivar', leadId: 'lead-1' });
  });

  it('un producto inexistente o un fallo del catálogo no impide guardar el lead: producto null', async () => {
    const inexistente = crear(() => Promise.reject(new ProductoNoDisponible()));
    const caido = crear(() => Promise.reject(new Error('base caída')));

    await inexistente.adaptador.evaluar({ temperatura: 'tibio', senales: [], resumen: 'x', productoId: 'SKU-9' }, CTX);
    await caido.adaptador.evaluar({ temperatura: 'tibio', senales: [], resumen: 'x', productoId: 'SKU-9' }, CTX);

    expect(inexistente.entradas[0]?.productoId).toBeNull();
    expect(caido.entradas[0]?.productoId).toBeNull();
  });

  it('sin producto no consulta el catálogo', async () => {
    let consultas = 0;
    const { adaptador } = crear(() => {
      consultas += 1;
      return Promise.resolve({ id: 'x' });
    });

    await adaptador.evaluar({ temperatura: 'tibio', senales: [], resumen: 'x', productoId: null }, CTX);

    expect(consultas).toBe(0);
  });
});
