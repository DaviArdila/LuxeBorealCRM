import { ContadoresSesionEnMemoria } from '../../../../test/fakes/contadores-sesion-en-memoria.js';
import { RepositorioContactoAgenteEnMemoria } from '../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { RepositorioLeadEnMemoria } from '../../../../test/fakes/repositorio-lead-en-memoria.js';
import type { ConsultaAsesorAvisado } from '../../conversaciones/index.js';
import { EvaluarPropuestaLead, HECHO_CAPTURA_PENDIENTE } from '../../leads/index.js';
import type { CapturaLead } from '../puertos/captura-lead.js';
import { ProductoNoDisponible, type ObtenerFichaProducto } from '../../catalogo/index.js';
import { ArmarContextoInicial } from './armar-contexto-inicial.js';

// Escenarios AGT12 y AGT28 de `openspec/changes/fase-12d-derivar-sin-silencio/specs/agente/spec.md`.

const SESION = { conversacionId: 'conv-1', version: 0 };
/** AGT27: sin respuesta, el contexto siempre informa el consentimiento como hecho. */
const HECHO_PENDIENTE = 'El cliente aún no respondió si acepta el tratamiento de datos.';

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
  const captura = { pendiente: false, completadas: [] as string[] };
  const capturaLead: CapturaLead = {
    pendiente: () => Promise.resolve(captura.pendiente),
    completar: (conversacionId) => {
      captura.completadas.push(conversacionId);
      return Promise.resolve();
    },
  };
  const avisado = { valor: false, falla: false };
  const asesorAvisado: ConsultaAsesorAvisado = {
    estaAvisado: () => (avisado.falla ? Promise.reject(new Error('redis caído')) : Promise.resolve(avisado.valor)),
  };
  return {
    caso: new ArmarContextoInicial(ficha, contactos, contadores, capturaLead, asesorAvisado),
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

    expect(instrucciones).toEqual([HECHO_PENDIENTE]);
    expect(consultados).toEqual(['SKU-999']);
  });

  it('AGT12 — El nombre de un cliente conocido se informa como hecho', async () => {
    const { caso, contactos } = crear();
    contactos.nombres.set('k', 'Laura');

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' });

    expect(instrucciones).toEqual(['El cliente se llama Laura.', HECHO_PENDIENTE]);
    expect(instrucciones.join('\n')).not.toMatch(/salúdalo|asumas|última vez/i);
  });

  it('el SKU solo se busca en el primer turno de la conversación', async () => {
    const { caso, contadores, consultados } = crear();
    await contadores.registrarTurno(SESION);

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'y el SKU-123?' });

    expect(instrucciones).toEqual([HECHO_PENDIENTE]);
    expect(consultados).toEqual([]);
  });

  it('una sesión posterior a un traspaso (versión > 0) tampoco toma el SKU como entrada', async () => {
    const { caso, consultados } = crear();

    await caso.ejecutar({ sesion: { ...SESION, version: 2 }, contactoId: 'k', textoCliente: 'SKU-123' });

    expect(consultados).toEqual([]);
  });

  it('un fallo al leer el catálogo o el contacto no rompe el turno: cae al caso genérico', async () => {
    const contadores = new ContadoresSesionEnMemoria();
    const contactos = {
      guardarDatosCapturados: () => Promise.resolve(),
      registrarConsentimiento: () => Promise.resolve(),
      leerNombre: () => Promise.reject(new Error('base caída')),
      consentimientoDe: () => Promise.reject(new Error('base caída')),
    };
    const ficha = { ejecutar: () => Promise.reject(new Error('base caída')) } as unknown as ObtenerFichaProducto;
    const capturaCaida: CapturaLead = { pendiente: () => Promise.reject(new Error('base caída')), completar: () => Promise.resolve() };
    const caso = new ArmarContextoInicial(ficha, contactos, contadores, capturaCaida, {
      estaAvisado: () => Promise.reject(new Error('redis caído')),
    });

    await expect(caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'SKU-123' })).resolves.toEqual([]);
  });

  it('LDS4 — Un lead confirmado fuera de horario informa el hecho y no ordena qué pedir', async () => {
    const { caso, captura, contactos } = crear();
    captura.pendiente = true;
    contactos.aceptar('k');

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'quiero pagar' });

    expect(instrucciones).toContain(HECHO_CAPTURA_PENDIENTE);
    const texto = instrucciones.join('\n');
    expect(texto).toMatch(/fuera de horario/i);
    expect(texto).toMatch(/intención de compra/i);
    expect(texto).toMatch(/nombre completo/i);
    expect(texto).not.toMatch(/pídele|uno a uno|despídete|texto exacto|guardar_datos_contacto/i);
  });

  it('R10 — Un lead caliente fuera de horario espera los datos antes del aviso: el contexto informa el hecho y no cierra la captura', async () => {
    const { caso, captura } = crear();
    captura.pendiente = true;

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'quiero pagar' });

    expect(instrucciones).toContain(HECHO_CAPTURA_PENDIENTE);
    // Armar el contexto solo informa: cerrar la captura (y con ella el aviso) lo hace `guardar_datos_contacto`.
    expect(captura.completadas).toEqual([]);
  });

  it('LDS4 — Sin consentimiento el contexto informa también el consentimiento pendiente', async () => {
    const { caso, captura } = crear();
    captura.pendiente = true;

    const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'quiero pagar' });

    const texto = instrucciones.join('\n');
    expect(instrucciones).toContain(HECHO_PENDIENTE);
    expect(instrucciones).toContain(HECHO_CAPTURA_PENDIENTE);
    expect(texto).not.toContain('guardar_datos_contacto');
  });

  it('LDS4 — Si no se puede leer el consentimiento la captura tampoco ordena guardar datos', async () => {
    const { caso, captura, contactos } = crear();
    captura.pendiente = true;
    contactos.fallo = new Error('base caída');

    const texto = (await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'quiero pagar' })).join('\n');

    expect(texto).toMatch(/intención de compra/i);
    expect(texto).not.toContain('guardar_datos_contacto');
  });

  it('LDS4 — El hecho de la captura es el mismo en el contexto y en la herramienta', async () => {
    const { caso, captura } = crear();
    captura.pendiente = true;
    const evaluar = new EvaluarPropuestaLead(new RepositorioLeadEnMemoria(), { estaDentroDeHorario: () => Promise.resolve(false) });

    const propuesta = await evaluar.ejecutar({
      conversacionId: 'conv-1',
      contactoId: 'k',
      temperatura: 'caliente',
      senales: ['pide_pagar'],
      resumen: 'Quiere el anillo',
      productoId: null,
    });
    const contexto = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'quiero pagar' });

    expect(propuesta.motivo).toBe(HECHO_CAPTURA_PENDIENTE);
    expect(contexto.filter((linea) => linea === propuesta.motivo)).toHaveLength(1);
  });

  it('sin captura pendiente no agrega instrucciones de captura', async () => {
    const { caso } = crear();

    const instrucciones = (await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' })).join('\n');

    expect(instrucciones).not.toContain('guardar_datos_contacto');
  });

  describe('AGT27 — el contexto informa el estado del consentimiento como un hecho', () => {
    it('AGT27 — El contexto informa que el contacto no ha respondido', async () => {
      const { caso } = crear();

      const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' });

      expect(instrucciones).toContain(HECHO_PENDIENTE);
    });

    it('AGT27 — El contexto informa que el contacto ya aceptó, sin ninguna orden', async () => {
      const { caso, contactos } = crear();
      contactos.aceptar('k');

      const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' });

      expect(instrucciones).toEqual(['El cliente aceptó el tratamiento de datos.']);
    });

    it('AGT27 — El contexto informa que el contacto rechazó', async () => {
      const { caso, contactos } = crear();
      await contactos.registrarConsentimiento('k', false);

      const instrucciones = await caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' });

      expect(instrucciones).toEqual(['El cliente rechazó el tratamiento de datos.']);
    });

    it('AGT26 — Si falla la lectura del consentimiento el turno sigue sin ese hecho', async () => {
      const { caso, contactos } = crear();
      contactos.fallo = new Error('base caída');

      await expect(caso.ejecutar({ sesion: SESION, contactoId: 'k', textoCliente: 'hola' })).resolves.toEqual([]);
    });
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

      expect(instrucciones).toEqual([HECHO_PENDIENTE]);
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
