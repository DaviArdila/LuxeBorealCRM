import { ContadoresSesionEnMemoria } from '../../../../test/fakes/contadores-sesion-en-memoria.js';
import { RepositorioContactoAgenteEnMemoria } from '../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { TextosAsistenteEnMemoria } from '../../../../test/fakes/textos-asistente-en-memoria.js';
import type { CapturaLead } from '../puertos/captura-lead.js';
import { ProductoNoDisponible, type ObtenerFichaProducto } from '../../catalogo/index.js';
import { ArmarContextoInicial } from './armar-contexto-inicial.js';

// Escenarios AGT12 de `openspec/changes/fase-12d-derivar-sin-silencio/specs/agente/spec.md`.

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
  const captura = { pendiente: false };
  const capturaLead: CapturaLead = {
    pendiente: () => Promise.resolve(captura.pendiente),
    completar: () => Promise.resolve(),
  };
  const parametros = new TextosAsistenteEnMemoria();
  parametros.textos.set('mensaje_captura_completa', 'TEXTO-CIERRE-CAPTURA');
  return {
    caso: new ArmarContextoInicial(ficha, contactos, contadores, capturaLead, parametros),
    contadores,
    contactos,
    consultados,
    captura,
  };
}

describe('modulos/agente/aplicacion — ArmarContextoInicial (AGT12, D7)', () => {
  it('AGT12 — Un SKU prellenado válido informa el producto de entrada como hecho', async () => {
    const { caso } = crear();

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'Hola, me interesa el SKU-123' });

    const texto = instrucciones.join('\n');
    expect(texto).toContain('El cliente llegó desde el producto «Anillo Aurora» (id: prod-123).');
    expect(texto).not.toMatch(/salúdalo|ofrécele|ficha/i);
  });

  it('AGT12 — Un SKU inexistente cae al caso genérico', async () => {
    const { caso, consultados } = crear();

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'me interesa el SKU-999' });

    expect(instrucciones).toEqual([]);
    expect(consultados).toEqual(['SKU-999']);
  });

  it('AGT12 — El nombre de un cliente conocido se informa como hecho', async () => {
    const { caso, contactos } = crear();
    contactos.nombres.set('k', 'Laura');

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' });

    expect(instrucciones).toEqual(['El cliente se llama Laura.']);
    expect(instrucciones.join('\n')).not.toMatch(/salúdalo|asumas|última vez/i);
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
    const capturaCaida: CapturaLead = { pendiente: () => Promise.reject(new Error('base caída')), completar: () => Promise.resolve() };
    const caso = new ArmarContextoInicial(ficha, contactos, contadores, capturaCaida, new TextosAsistenteEnMemoria());

    await expect(caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'SKU-123' })).resolves.toEqual([]);
  });

  it('LDS4 — Handoff fuera de horario dispara la captura de datos: las instrucciones piden los cuatro datos y el cierre', async () => {
    const { caso, captura } = crear();
    captura.pendiente = true;

    const instrucciones = (await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'quiero pagar' })).join('\n');

    expect(instrucciones).toMatch(/nombre completo/i);
    expect(instrucciones).toMatch(/teléfono/i);
    expect(instrucciones).toMatch(/dirección/i);
    expect(instrucciones).toMatch(/localidad/i);
    expect(instrucciones).toContain('guardar_datos_contacto');
    expect(instrucciones).toContain('TEXTO-CIERRE-CAPTURA');
  });

  it('sin captura pendiente no agrega instrucciones de captura', async () => {
    const { caso } = crear();

    const instrucciones = (await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' })).join('\n');

    expect(instrucciones).not.toContain('guardar_datos_contacto');
  });
});
