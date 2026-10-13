import { evaluarAserciones, type GrabacionTurno } from './aserciones.js';

// Escenarios EVL2 de `openspec/changes/archive/2026-09-30-fase-07c-evals/specs/agente/spec.md` y una prueba positiva y
// una negativa por cada aserción (D4).

function grabacion(sobrescribir: Partial<GrabacionTurno> = {}): GrabacionTurno {
  return { llamadas: [], resultados: [], textoFinal: 'Hola', handoff: null, aviso: null, ...sobrescribir };
}

function unica(g: GrabacionTurno, aserciones: Parameters<typeof evaluarAserciones>[1]) {
  const resultados = evaluarAserciones(g, aserciones);
  expect(resultados).toHaveLength(1);
  return resultados[0];
}

describe('test/evals — evaluarAserciones', () => {
  it('EVL2 — Un monto sin rastro en herramientas hace fallar la aserción', () => {
    const g = grabacion({ textoFinal: 'Cuesta $350.000', resultados: [{ nombre: 'obtener_ficha', resultado: { precio_texto: '$389.000' }, esError: false }] });

    const r = unica(g, { dineroConRastro: true });

    expect(r).toMatchObject({ nombre: 'dineroConRastro', ok: false, critica: true });
    expect(r.detalle).not.toContain('350');
  });

  it('un monto que sí viene de una herramienta pasa', () => {
    const g = grabacion({ textoFinal: 'Cuesta $389.000', resultados: [{ nombre: 'obtener_ficha', resultado: { precio_texto: '$389.000' }, esError: false }] });

    expect(unica(g, { dineroConRastro: true }).ok).toBe(true);
  });

  it('EVL2 — Un porcentaje de recargo hace fallar la aserción', () => {
    const r = unica(grabacion({ textoFinal: '5 % adicional por contra entrega' }), { recargoSinPorcentaje: true });

    expect(r).toMatchObject({ nombre: 'recargoSinPorcentaje', ok: false, critica: true });
  });

  it('"por ciento" también cuenta como porcentaje; un texto sin cifras pasa', () => {
    expect(unica(grabacion({ textoFinal: 'un cinco por ciento más' }), { recargoSinPorcentaje: true }).ok).toBe(false);
    expect(unica(grabacion({ textoFinal: 'El recargo se suma al total.' }), { recargoSinPorcentaje: true }).ok).toBe(true);
  });

  it('EVL2 — Un handoff no esperado hace fallar la aserción', () => {
    const r = unica(grabacion({ handoff: 'fallo-llm' }), { handoff: 'prohibido' });

    expect(r).toMatchObject({ nombre: 'handoff', ok: false, critica: true });
  });

  it('handoff esperado: falla si no hubo y pasa si hubo; no es crítica', () => {
    expect(unica(grabacion(), { handoff: 'esperado' })).toMatchObject({ ok: false, critica: false });
    expect(unica(grabacion({ handoff: 'tope-turnos' }), { handoff: 'esperado' }).ok).toBe(true);
  });

  it('herramientasProhibidas es crítica y falla si alguna se llamó', () => {
    const g = grabacion({ llamadas: [{ nombre: 'marcar_lead_caliente', argumentos: {} }] });

    expect(unica(g, { herramientasProhibidas: ['marcar_lead_caliente'] })).toMatchObject({ ok: false, critica: true });
    expect(unica(grabacion(), { herramientasProhibidas: ['marcar_lead_caliente'] }).ok).toBe(true);
  });

  it('resultadosEsperados exige que la herramienta haya devuelto esos campos (AGT26)', () => {
    const resultado = { nombre: 'guardar_datos_contacto', resultado: { requiereConsentimiento: true }, esError: false };
    const esperado = { resultadosEsperados: [{ herramienta: 'guardar_datos_contacto', resultado: { requiereConsentimiento: true } }] };

    expect(unica(grabacion({ resultados: [resultado] }), esperado)).toMatchObject({ nombre: 'resultadosEsperados', ok: true, critica: false });
    expect(unica(grabacion({ resultados: [{ ...resultado, resultado: { guardado: true } }] }), esperado).ok).toBe(false);
    expect(unica(grabacion(), esperado).ok).toBe(false);
  });

  it('herramientasEsperadas exige la herramienta y, si se declaran, los argumentos parciales', () => {
    const g = grabacion({ llamadas: [{ nombre: 'enviar_fotos', argumentos: { id_producto: 'X', angulo: 'detalle' } }] });

    expect(unica(g, { herramientasEsperadas: [{ nombre: 'enviar_fotos', argumentos: { angulo: 'detalle' } }] }).ok).toBe(true);
    expect(unica(g, { herramientasEsperadas: [{ nombre: 'enviar_fotos', argumentos: { angulo: 'frente' } }] }).ok).toBe(false);
    expect(unica(g, { herramientasEsperadas: [{ nombre: 'cotizar_envio' }] })).toMatchObject({ ok: false, critica: false });
  });

  it('textoLiteral exige que el campo devuelto por la herramienta aparezca sin cambios', () => {
    const resultado = { nombre: 'consultar_caso', resultado: { encontrada: true, texto: 'Se suma al total.' }, esError: false };

    expect(unica(grabacion({ textoFinal: 'Ojo: Se suma al total.', resultados: [resultado] }), { textoLiteral: [{ herramienta: 'consultar_caso', campo: 'texto' }] }).ok).toBe(true);
    expect(unica(grabacion({ textoFinal: 'se suma al total', resultados: [resultado] }), { textoLiteral: [{ herramienta: 'consultar_caso', campo: 'texto' }] }).ok).toBe(false);
  });

  it('textoLiteral no aplica si la herramienta no se llamó: la ausencia ya la vigila herramientasEsperadas', () => {
    expect(evaluarAserciones(grabacion({ textoFinal: 'x' }), { textoLiteral: [{ herramienta: 'consultar_caso', campo: 'texto' }] })).toEqual([]);
  });

  it('CAS8 — textoLiteral acepta el texto del caso sembrado, venga del prompt o de consultar_caso', () => {
    const contexto = { textosDeCasos: new Map([['Medios de pago', 'Aceptamos transferencia.\nY contra entrega.']]) };
    const aserciones = { textoLiteral: [{ caso: 'Medios de pago' }] };

    // Sin llamar consultar_caso: el texto ya viajaba en el prompt. Los saltos de línea no cuentan como cambio.
    expect(evaluarAserciones(grabacion({ textoFinal: 'Claro: Aceptamos transferencia. Y contra entrega.' }), aserciones, contexto)).toEqual([
      expect.objectContaining({ nombre: 'textoLiteral', ok: true, critica: false }),
    ]);
    expect(evaluarAserciones(grabacion({ textoFinal: 'Aceptamos transferencias.' }), aserciones, contexto)[0]?.ok).toBe(false);
  });

  it('textoLiteral con un caso que no se sembró falla nombrándolo: es un error del caso de eval', () => {
    const [r] = evaluarAserciones(grabacion(), { textoLiteral: [{ caso: 'Garantía' }] }, { textosDeCasos: new Map() });

    expect(r).toMatchObject({ ok: false, detalle: 'no aparece literal: caso «Garantía» (no sembrado)' });
  });

  it('AGT8 — textoLiteral con algunaDe acepta el precio de obtener_ficha o el de la ficha que trae buscar_producto', () => {
    const aserciones = {
      textoLiteral: [{ algunaDe: [{ herramienta: 'obtener_ficha', campo: 'precio_texto' }, { herramienta: 'buscar_producto', campo: 'ficha.precio_texto' }] }],
    };
    const busqueda = {
      nombre: 'buscar_producto',
      resultado: [{ id: 'a', ficha: { precio_texto: '$389.000' } }, { id: 'b', ficha: { precio_texto: '$149.000' } }, { id: 'c' }],
      esError: false,
    };

    expect(unica(grabacion({ textoFinal: 'El Anillo Aurora cuesta $389.000.', resultados: [busqueda] }), aserciones).ok).toBe(true);
    expect(unica(grabacion({ textoFinal: 'Cuesta poco.', resultados: [busqueda] }), aserciones).ok).toBe(false);
  });

  it('herramientasEsperadas con algunaDe pasa si se llamó cualquiera de las alternativas', () => {
    const aserciones = { herramientasEsperadas: [{ algunaDe: [{ nombre: 'obtener_ficha' }, { nombre: 'buscar_producto' }] }] };

    expect(unica(grabacion({ llamadas: [{ nombre: 'buscar_producto', argumentos: { query: 'anillo' } }] }), aserciones).ok).toBe(true);
    expect(unica(grabacion({ llamadas: [{ nombre: 'cotizar_envio', argumentos: {} }] }), aserciones)).toMatchObject({
      ok: false,
      detalle: 'no se llamó: obtener_ficha o buscar_producto',
    });
  });

  it('textoAusente falla si aparece un texto que no debía citarse', () => {
    expect(unica(grabacion({ textoFinal: 'Pagas contra entrega' }), { textoAusente: ['contra entrega'] }).ok).toBe(false);
    expect(unica(grabacion({ textoFinal: 'Es de oro' }), { textoAusente: ['contra entrega'] }).ok).toBe(true);
  });

  it('AGT24 — La aserción aviso distingue la respuesta con aviso al asesor de la que no lo trae', () => {
    const conAviso = grabacion({ aviso: 'pide-asesor' });

    expect(unica(conAviso, { aviso: 'esperado' })).toMatchObject({ nombre: 'aviso', ok: true, critica: false });
    expect(unica(grabacion(), { aviso: 'esperado' })).toMatchObject({ ok: false, detalle: 'faltó el aviso esperado' });
    expect(unica(conAviso, { aviso: 'prohibido' }).ok).toBe(false);
    expect(unica(grabacion(), { aviso: 'prohibido' }).ok).toBe(true);
  });

  it('menciona ignora tildes y mayúsculas', () => {
    expect(unica(grabacion({ textoFinal: '¿En qué CIUDAD estás?' }), { menciona: ['ciudad'] }).ok).toBe(true);
    expect(unica(grabacion({ textoFinal: 'Hola' }), { menciona: ['ciudad'] }).ok).toBe(false);
  });

  it('AGT16 — Una respuesta con SKU falla la aserción', () => {
    const r = unica(grabacion({ textoFinal: 'Es el SKU-GL001, un grifo alto.' }), { sinSku: true });

    expect(r).toMatchObject({ nombre: 'sinSku', ok: false, critica: false });
    expect(r.detalle).not.toContain('GL001');
  });

  it('una respuesta sin SKU pasa; la palabra sola no cuenta como SKU', () => {
    expect(unica(grabacion({ textoFinal: 'Es el grifo alto de cuello largo.' }), { sinSku: true }).ok).toBe(true);
    expect(unica(grabacion({ textoFinal: 'No te muestro el sku interno.' }), { sinSku: true }).ok).toBe(true);
  });

  it('devuelve un resultado por aserción declarada, en un orden fijo', () => {
    const r = evaluarAserciones(grabacion(), { sinSku: true, menciona: ['hola'], handoff: 'prohibido', dineroConRastro: true });

    expect(r.map((x) => x.nombre)).toEqual(['dineroConRastro', 'handoff', 'menciona', 'sinSku']);
  });
});
