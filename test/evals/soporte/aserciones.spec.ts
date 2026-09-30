import { evaluarAserciones, type GrabacionTurno } from './aserciones.js';

// Escenarios EVL2 de `openspec/changes/archive/2026-09-30-fase-07c-evals/specs/agente/spec.md` y una prueba positiva y
// una negativa por cada aserción (D4).

function grabacion(sobrescribir: Partial<GrabacionTurno> = {}): GrabacionTurno {
  return { llamadas: [], resultados: [], textoFinal: 'Hola', handoff: null, ...sobrescribir };
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

  it('herramientasEsperadas exige la herramienta y, si se declaran, los argumentos parciales', () => {
    const g = grabacion({ llamadas: [{ nombre: 'enviar_fotos', argumentos: { id_producto: 'X', modo: 'collage' } }] });

    expect(unica(g, { herramientasEsperadas: [{ nombre: 'enviar_fotos', argumentos: { modo: 'collage' } }] }).ok).toBe(true);
    expect(unica(g, { herramientasEsperadas: [{ nombre: 'enviar_fotos', argumentos: { modo: 'individuales' } }] }).ok).toBe(false);
    expect(unica(g, { herramientasEsperadas: [{ nombre: 'cotizar_envio' }] })).toMatchObject({ ok: false, critica: false });
  });

  it('textoLiteral exige que el campo devuelto por la herramienta aparezca sin cambios', () => {
    const resultado = { nombre: 'consultar_politica', resultado: { encontrada: true, texto: 'Se suma al total.' }, esError: false };

    expect(unica(grabacion({ textoFinal: 'Ojo: Se suma al total.', resultados: [resultado] }), { textoLiteral: [{ herramienta: 'consultar_politica', campo: 'texto' }] }).ok).toBe(true);
    expect(unica(grabacion({ textoFinal: 'se suma al total', resultados: [resultado] }), { textoLiteral: [{ herramienta: 'consultar_politica', campo: 'texto' }] }).ok).toBe(false);
    expect(unica(grabacion({ textoFinal: 'x' }), { textoLiteral: [{ herramienta: 'consultar_politica', campo: 'texto' }] }).ok).toBe(false);
  });

  it('textoAusente falla si aparece un texto que no debía citarse', () => {
    expect(unica(grabacion({ textoFinal: 'Pagas contra entrega' }), { textoAusente: ['contra entrega'] }).ok).toBe(false);
    expect(unica(grabacion({ textoFinal: 'Es de oro' }), { textoAusente: ['contra entrega'] }).ok).toBe(true);
  });

  it('menciona ignora tildes y mayúsculas', () => {
    expect(unica(grabacion({ textoFinal: '¿En qué CIUDAD estás?' }), { menciona: ['ciudad'] }).ok).toBe(true);
    expect(unica(grabacion({ textoFinal: 'Hola' }), { menciona: ['ciudad'] }).ok).toBe(false);
  });

  it('devuelve un resultado por aserción declarada, en un orden fijo', () => {
    const r = evaluarAserciones(grabacion(), { menciona: ['hola'], handoff: 'prohibido', dineroConRastro: true });

    expect(r.map((x) => x.nombre)).toEqual(['dineroConRastro', 'handoff', 'menciona']);
  });
});
