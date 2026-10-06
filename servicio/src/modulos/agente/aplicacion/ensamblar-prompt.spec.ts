import type { ObtenerCatalogoCompacto } from '../../catalogo/index.js';
import type { ConsultaCasos, EntradaIndice } from '../../asistente/index.js';
import type { Horario } from '../../horario/index.js';
import { CargadorPrompts } from '../infraestructura/prompts/cargador-prompts.js';
import { EnsamblarPrompt } from './ensamblar-prompt.js';
import type { EstiloVigente, ProveedorEstilo } from './proveedor-estilo.js';

// Escenarios AGT13 de `openspec/specs/agente/spec.md`; el estilo separado es de la Fase 08b
// (`openspec/changes/fase-08b-comportamiento-agente/`).

const CATALOGO = '- SKU-1: Anillo Aurora — Oro laminado\n- SKU-2: Collar Luna — Plata 925';

function crear(catalogo = CATALOGO, dentroDeHorario = true, estilo?: Partial<EstiloVigente>, indice: readonly EntradaIndice[] = []) {
  const cargador = new CargadorPrompts();
  cargador.onModuleInit();
  const compacto = { ejecutar: () => Promise.resolve(catalogo) } as unknown as ObtenerCatalogoCompacto;
  const horario: Horario = { estaDentroDeHorario: () => Promise.resolve(dentroDeHorario) };
  // El proveedor entrega por defecto el estilo del archivo (origen `archivo`); cada test lo cambia si lo necesita.
  const vigente: EstiloVigente = { texto: cargador.estilo, version: 0, origen: 'archivo', ...estilo };
  const proveedor = { obtener: () => Promise.resolve(vigente) } as unknown as ProveedorEstilo;
  const casos = { indice: () => Promise.resolve(indice) } as unknown as ConsultaCasos;
  return { ensamblar: new EnsamblarPrompt(cargador, proveedor, compacto, horario, casos), cargador };
}

describe('modulos/agente/aplicacion — EnsamblarPrompt (D8, AGT13)', () => {
  it('AGT13 — Dos conversaciones distintas comparten el mismo prefijo', async () => {
    const { ensamblar } = crear();

    const a = await ensamblar.ensamblar({ instruccionesTurno: ['El cliente se llama Laura.'] });
    const b = await ensamblar.ensamblar({ instruccionesTurno: [] });

    const finCatalogo = a.texto.indexOf(CATALOGO) + CATALOGO.length;
    expect(finCatalogo).toBeGreaterThan(CATALOGO.length);
    expect(b.texto.slice(0, finCatalogo)).toBe(a.texto.slice(0, finCatalogo));
    expect(a.texto.slice(finCatalogo)).toContain('Laura');
    expect(b.texto.slice(finCatalogo)).not.toContain('Laura');
  });

  it('AGT13 — El prompt no contiene precios', async () => {
    const { ensamblar } = crear();

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(texto).not.toMatch(/\$\s?\d/);
    expect(texto).not.toMatch(/\bCOP\b/);
  });

  it('AGT13 — El estilo va entre las reglas y el catálogo', async () => {
    const { ensamblar, cargador } = crear(CATALOGO, true, { texto: 'ESTILO-DE-LA-BASE: sé breve.', version: 3, origen: 'base' });

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: ['INSTRUCCION-DEL-TURNO'] });

    const posReglas = texto.indexOf(cargador.reglas.trim());
    const posEstilo = texto.indexOf('ESTILO-DE-LA-BASE');
    const posCatalogo = texto.indexOf(CATALOGO);
    const posTurno = texto.indexOf('INSTRUCCION-DEL-TURNO');
    expect(posReglas).toBe(0);
    expect(posEstilo).toBeGreaterThan(posReglas);
    expect(posCatalogo).toBeGreaterThan(posEstilo);
    expect(posTurno).toBeGreaterThan(posCatalogo);
  });

  it('AGT13 — Cambiar el estilo no cambia las reglas', async () => {
    const base = crear();
    const alterno = crear(CATALOGO, true, { texto: 'ESTILO-ALTERNO: usa un tono muy formal.', version: 2, origen: 'base' });

    const a = await base.ensamblar.ensamblar({ instruccionesTurno: [] });
    const b = await alterno.ensamblar.ensamblar({ instruccionesTurno: [] });

    const finReglas = a.texto.indexOf(base.cargador.reglas.trim()) + base.cargador.reglas.trim().length;
    expect(finReglas).toBeGreaterThan(100);
    expect(b.texto.slice(0, finReglas)).toBe(a.texto.slice(0, finReglas));
    expect(b.texto).toContain('ESTILO-ALTERNO');
    expect(a.texto).not.toContain('ESTILO-ALTERNO');
  });

  it('AGT18 — Un estilo publicado reemplaza al del archivo en el prompt', async () => {
    const { ensamblar, cargador } = crear(CATALOGO, true, { texto: 'ESTILO-PUBLICADO', version: 5, origen: 'base' });

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(texto).toContain('ESTILO-PUBLICADO');
    expect(texto).not.toContain(cargador.estilo.trim());
  });

  it('AGT13 — La versión del estilo se entrega junto con la del prompt, sin su contenido', async () => {
    const { ensamblar } = crear(CATALOGO, true, { texto: 'ESTILO-PUBLICADO', version: 5, origen: 'base' });

    const resultado = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(resultado).toMatchObject({ version: 'v4', versionEstilo: 5 });
    expect(JSON.stringify({ version: resultado.version, versionEstilo: resultado.versionEstilo })).not.toContain('ESTILO-PUBLICADO');
  });

  it('el estilo ordena sin emojis, viñetas y sin pegotes; las reglas no hablan de estilo', () => {
    const { cargador } = crear();

    expect(cargador.estilo).toMatch(/sin emojis/i);
    expect(cargador.estilo).toMatch(/viñetas/i);
    expect(cargador.estilo).toMatch(/pegot/i);
    expect(cargador.reglas).not.toMatch(/emoji/i);
    expect(cargador.reglas).not.toMatch(/Sin listas largas/i);
  });

  it('la parte variable dice si es horario de atención', async () => {
    const dentro = await crear(CATALOGO, true).ensamblar.ensamblar({ instruccionesTurno: [] });
    const fuera = await crear(CATALOGO, false).ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(dentro.texto).toContain('dentro del horario');
    expect(fuera.texto).toContain('fuera del horario');
  });

  it('entrega la versión del prompt para el log del turno', async () => {
    const { ensamblar } = crear();

    await expect(ensamblar.ensamblar({ instruccionesTurno: [] })).resolves.toMatchObject({ version: 'v4' });
  });

  it('las reglas incluyen la política de citar políticas, el recargo sin porcentaje y la ubicación', () => {
    const { cargador } = crear();

    expect(cargador.reglas).toMatch(/consultar_caso/);
    expect(cargador.reglas).not.toMatch(/consultar_politica/);
    expect(cargador.reglas).toMatch(/contra entrega/i);
    expect(cargador.reglas).toMatch(/una sola vez/i);
    expect(cargador.reglas).toMatch(/porcentaje/i);
    expect(cargador.reglas).toMatch(/ciudad y departamento/i);
    expect(cargador.reglas).toMatch(/enviar_fotos/);
    expect(cargador.reglas).toMatch(/ángulo/i);
    expect(cargador.reglas).not.toMatch(/collage/i);
  });

  it('las reglas exigen citar literal los textos de las herramientas y no repetir llamadas (v4)', () => {
    const { cargador } = crear();

    expect(cargador.reglas).toMatch(/palabra por palabra/i);
    for (const campo of ['precio_texto', 'rango_texto', 'dias_texto', 'mensaje_sin_cobertura', 'politica_contraentrega_texto']) {
      expect(cargador.reglas).toContain(`\`${campo}\``);
    }
    expect(cargador.reglas).toMatch(/nunca dentro de ella/i);
    expect(cargador.reglas).toMatch(/no llames a otra herramienta para lo mismo/i);
    expect(cargador.reglas).toMatch(/no lo adivines/i);
  });
  const INDICE: readonly EntradaIndice[] = [
    { titulo: 'Garantía', cuandoAplica: 'Cuando el cliente pregunta por la garantía.' },
    { titulo: 'Medios de pago', cuandoAplica: 'Cuando el cliente pregunta cómo puede pagar.' },
  ];

  it('CAS8 — El índice de casos va después del estilo y antes del catálogo, con título y «cuándo aplica»', async () => {
    const { ensamblar } = crear(CATALOGO, true, { texto: 'ESTILO-DE-LA-BASE: sé breve.', version: 3, origen: 'base' }, INDICE);

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    const posEstilo = texto.indexOf('ESTILO-DE-LA-BASE');
    const posIndice = texto.indexOf('- Garantía: Cuando el cliente pregunta por la garantía.');
    const posCatalogo = texto.indexOf(CATALOGO);
    expect(posIndice).toBeGreaterThan(posEstilo);
    expect(posCatalogo).toBeGreaterThan(posIndice);
    expect(texto).toContain('- Medios de pago: Cuando el cliente pregunta cómo puede pagar.');
    expect(texto).toContain('consultar_caso');
  });

  it('CAS8 — El índice no trae el texto de los casos, solo su título y cuándo aplican', async () => {
    const { ensamblar } = crear(CATALOGO, true, undefined, [
      { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan.', ...({ texto: 'TEXTO-DEL-CASO' } as object) },
    ]);

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(texto).not.toContain('TEXTO-DEL-CASO');
  });

  it('CAS8 — Sin casos de intención no hay sección de casos en el prompt', async () => {
    const { ensamblar } = crear();

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(texto).not.toContain('# Casos de uso');
  });

  it('CAS8 — El índice no cambia el prefijo entre conversaciones distintas', async () => {
    const { ensamblar } = crear(CATALOGO, true, undefined, INDICE);

    const a = await ensamblar.ensamblar({ instruccionesTurno: ['El cliente se llama Laura.'] });
    const b = await ensamblar.ensamblar({ instruccionesTurno: [] });

    const fin = a.texto.indexOf(CATALOGO) + CATALOGO.length;
    expect(b.texto.slice(0, fin)).toBe(a.texto.slice(0, fin));
  });

  it('CAS8 — Las reglas v4: literal palabra por palabra, guía sin datos nuevos y consultar solo lo que el índice lista', () => {
    const { cargador } = crear();

    expect(cargador.reglas).toMatch(/modo `literal`/);
    expect(cargador.reglas).toMatch(/modo `guia`/);
    expect(cargador.reglas).toMatch(/sin agregar datos que el caso no trae/i);
    expect(cargador.reglas).toMatch(/solo si el título está en el índice/i);
    expect(cargador.reglas).toMatch(/`encontrado: false`/);
  });
});
