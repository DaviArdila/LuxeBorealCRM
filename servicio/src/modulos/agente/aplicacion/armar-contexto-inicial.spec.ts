import { ContadoresSesionEnMemoria } from '../../../../test/fakes/contadores-sesion-en-memoria.js';
import { RepositorioContactoAgenteEnMemoria } from '../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { TextosAsistenteEnMemoria } from '../../../../test/fakes/textos-asistente-en-memoria.js';
import type { ConsultaAsesorAvisado } from '../../conversaciones/index.js';
import type { CapturaLead } from '../puertos/captura-lead.js';
import { ProductoNoDisponible, type ObtenerFichaProducto } from '../../catalogo/index.js';
import { ArmarContextoInicial } from './armar-contexto-inicial.js';

// Escenarios AGT12 y AGT28 de `openspec/changes/fase-12d-derivar-sin-silencio/specs/agente/spec.md`.

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
  const avisado = { valor: false, falla: false };
  const asesorAvisado: ConsultaAsesorAvisado = {
    estaAvisado: () => (avisado.falla ? Promise.reject(new Error('redis caído')) : Promise.resolve(avisado.valor)),
  };
  return {
    caso: new ArmarContextoInicial(ficha, contactos, contadores, capturaLead, parametros, asesorAvisado),
    avisado,
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
    const caso = new ArmarContextoInicial(ficha, contactos, contadores, capturaCaida, new TextosAsistenteEnMemoria(), {
      estaAvisado: () => Promise.reject(new Error('redis caído')),
    });

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

  describe('AGT28 — con el asesor ya avisado, el bot no confirma pagos, apartados ni descuentos', () => {
    it('AGT28 — El contexto agrega la instrucción cuando el asesor ya fue avisado', async () => {
      const { caso, avisado } = crear();
      avisado.valor = true;

      const texto = (await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'quiero apartarlo' })).join('\n');

      expect(texto).toMatch(/asesor ya fue avisado/i);
      expect(texto).toMatch(/pagos, apartados ni descuentos/);
      expect(texto).toMatch(/el asesor lo confirma/);
      expect(texto).toMatch(/precios/);
    });

    it('AGT28 — Sin aviso el contexto no incluye la instrucción', async () => {
      const { caso } = crear();

      const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' });

      expect(instrucciones.join('\n')).not.toMatch(/apartados|asesor ya fue avisado/);
    });

    it('AGT28 — Un fallo al consultar la marca no rompe el contexto', async () => {
      const { caso, avisado } = crear();
      avisado.falla = true;

      const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' });

      expect(instrucciones).toEqual([]);
    });

    it('AGT14 — Si la política acaba de pedir el aviso, el contexto informa la petición de persona y el límite', async () => {
      const { caso } = crear();

      const texto = (
        await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'quiero un asesor', avisoPedido: 'pide-persona' })
      ).join('\n');

      expect(texto).toMatch(/pidió hablar con una persona/i);
      expect(texto).toMatch(/pagos, apartados ni descuentos/);
    });

    it('AGT28 — Un aviso pedido por otro motivo también activa el límite', async () => {
      const { caso } = crear();

      const texto = (
        await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola', avisoPedido: 'lead-caliente' })
      ).join('\n');

      expect(texto).toMatch(/pagos, apartados ni descuentos/);
      expect(texto).not.toMatch(/pidió hablar con una persona/i);
    });
  });
});
