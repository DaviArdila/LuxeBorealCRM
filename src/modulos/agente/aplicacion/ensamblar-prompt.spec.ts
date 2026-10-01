import type { ObtenerCatalogoCompacto } from '../../catalogo/index.js';
import type { Horario } from '../../horario/index.js';
import { CargadorPrompts } from '../infraestructura/prompts/cargador-prompts.js';
import { EnsamblarPrompt } from './ensamblar-prompt.js';

// Escenarios AGT13 de `openspec/specs/agente/spec.md`; el estilo separado es de la Fase 08b
// (`openspec/changes/fase-08b-comportamiento-agente/`).

const CATALOGO = '- SKU-1: Anillo Aurora — Oro laminado\n- SKU-2: Collar Luna — Plata 925';

function crear(catalogo = CATALOGO, dentroDeHorario = true) {
  const cargador = new CargadorPrompts();
  cargador.onModuleInit();
  const compacto = { ejecutar: () => Promise.resolve(catalogo) } as unknown as ObtenerCatalogoCompacto;
  const horario: Horario = { estaDentroDeHorario: () => Promise.resolve(dentroDeHorario) };
  return { ensamblar: new EnsamblarPrompt(cargador, compacto, horario), cargador };
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
    const { ensamblar, cargador } = crear();

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: ['INSTRUCCION-DEL-TURNO'] });

    const posReglas = texto.indexOf(cargador.reglas.trim());
    const posEstilo = texto.indexOf(cargador.estilo.trim());
    const posCatalogo = texto.indexOf(CATALOGO);
    const posTurno = texto.indexOf('INSTRUCCION-DEL-TURNO');
    expect(posReglas).toBe(0);
    expect(posEstilo).toBeGreaterThan(posReglas);
    expect(posCatalogo).toBeGreaterThan(posEstilo);
    expect(posTurno).toBeGreaterThan(posCatalogo);
  });

  it('AGT13 — Cambiar el estilo no cambia las reglas', async () => {
    const base = crear();
    const alterno = crear();
    alterno.cargador.estilo = 'ESTILO-ALTERNO: usa un tono muy formal.';

    const a = await base.ensamblar.ensamblar({ instruccionesTurno: [] });
    const b = await alterno.ensamblar.ensamblar({ instruccionesTurno: [] });

    const finReglas = a.texto.indexOf(base.cargador.reglas.trim()) + base.cargador.reglas.trim().length;
    expect(finReglas).toBeGreaterThan(100);
    expect(b.texto.slice(0, finReglas)).toBe(a.texto.slice(0, finReglas));
    expect(b.texto).toContain('ESTILO-ALTERNO');
    expect(a.texto).not.toContain('ESTILO-ALTERNO');
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

    await expect(ensamblar.ensamblar({ instruccionesTurno: [] })).resolves.toMatchObject({ version: 'v2' });
  });

  it('las reglas incluyen la política de citar políticas, el recargo sin porcentaje y la ubicación', () => {
    const { cargador } = crear();

    expect(cargador.reglas).toMatch(/consultar_politica/);
    expect(cargador.reglas).toMatch(/contra entrega/i);
    expect(cargador.reglas).toMatch(/una sola vez/i);
    expect(cargador.reglas).toMatch(/porcentaje/i);
    expect(cargador.reglas).toMatch(/ciudad y departamento/i);
    expect(cargador.reglas).toMatch(/collage/i);
  });
});
