import { ContadoresSesionEnMemoria } from '../../../../test/fakes/contadores-sesion-en-memoria.js';
import { RepositorioContactoAgenteEnMemoria } from '../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { ProductoNoDisponible, type ObtenerFichaProducto } from '../../catalogo/index.js';
import { ArmarContextoInicial } from './armar-contexto-inicial.js';

// Escenarios AGT12 de `openspec/changes/fase-07b-agente-llm-herramientas/specs/agente/spec.md`.

const SESION = { conversacionId: 'conv-1', version: 0 };

function crear() {
  const contadores = new ContadoresSesionEnMemoria();
  const contactos = new RepositorioContactoAgenteEnMemoria();
  const consultados: string[] = [];
  const ficha = {
    ejecutar: (sku: string) => {
      consultados.push(sku);
      return sku.toUpperCase() === 'SKU-123'
        ? Promise.resolve({ id: 'prod-123', sku: 'SKU-123', nombre: 'Anillo Aurora', descripcionLarga: '', precioTexto: '$1', tieneFotos: true })
        : Promise.reject(new ProductoNoDisponible());
    },
  } as unknown as ObtenerFichaProducto;
  return { caso: new ArmarContextoInicial(ficha, contactos, contadores), contadores, contactos, consultados };
}

describe('modulos/agente/aplicacion — ArmarContextoInicial (AGT12, D7)', () => {
  it('AGT12 — Un SKU prellenado válido arranca con ese producto en contexto', async () => {
    const { caso } = crear();

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'Hola, me interesa el SKU-123' });

    expect(instrucciones.join('\n')).toContain('prod-123');
    expect(instrucciones.join('\n')).toContain('Anillo Aurora');
  });

  it('AGT12 — Un SKU inexistente cae al caso genérico', async () => {
    const { caso, consultados } = crear();

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'me interesa el SKU-999' });

    expect(instrucciones).toEqual([]);
    expect(consultados).toEqual(['SKU-999']);
  });

  it('AGT12 — Un cliente conocido se saluda por su nombre sin asumir su interés', async () => {
    const { caso, contactos } = crear();
    contactos.nombres.set('k', 'Laura');

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' });

    const texto = instrucciones.join('\n');
    expect(texto).toContain('Laura');
    expect(texto).toMatch(/no asumas/i);
  });

  it('el SKU solo se busca en el primer turno de la conversación', async () => {
    const { caso, contadores, consultados } = crear();
    await contadores.registrarTurno(SESION);

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'y el SKU-123?' });

    expect(instrucciones).toEqual([]);
    expect(consultados).toEqual([]);
  });

  it('una sesión posterior a un traspaso (versión > 0) tampoco toma el SKU como entrada', async () => {
    const { caso, consultados } = crear();

    await caso.ejecutar({ sesion: { ...SESION, version: 2 }, contactoId: 'k', textoCliente: 'SKU-123' });

    expect(consultados).toEqual([]);
  });

  it('un fallo al leer el catálogo o el contacto no rompe el turno: cae al caso genérico', async () => {
    const contadores = new ContadoresSesionEnMemoria();
    const contactos = { leerNombre: () => Promise.reject(new Error('base caída')), guardarDatosCapturados: () => Promise.resolve() };
    const ficha = { ejecutar: () => Promise.reject(new Error('base caída')) } as unknown as ObtenerFichaProducto;
    const caso = new ArmarContextoInicial(ficha, contactos, contadores);

    await expect(caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'SKU-123' })).resolves.toEqual([]);
  });
});
