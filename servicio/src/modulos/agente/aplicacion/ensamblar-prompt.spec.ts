import { readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizarTexto } from '../../../compartido/texto/index.js';
import { componerEstilo, dividirEstilo } from '../dominio/secciones-estilo.js';
import type { ObtenerCatalogoCompacto } from '../../catalogo/index.js';
import type { CasosDelPrompt, ConsultaCasos, EntradaIndice } from '../../asistente/index.js';
import type { Horario } from '../../horario/index.js';
import { CargadorPrompts } from '../infraestructura/prompts/cargador-prompts.js';
import { EnsamblarPrompt } from './ensamblar-prompt.js';
import type { EstiloVigente, ProveedorEstilo } from './proveedor-estilo.js';

// Escenarios AGT13 y AGT24 del delta de `openspec/changes/fase-12d-derivar-sin-silencio/specs/agente/spec.md`.

const CATALOGO = '- SKU-1: Anillo Aurora — Oro laminado\n- SKU-2: Collar Luna — Plata 925';

function crear(
  catalogo = CATALOGO,
  dentroDeHorario = true,
  estilo?: Partial<EstiloVigente>,
  delPrompt: readonly EntradaIndice[] | CasosDelPrompt = [],
) {
  const cargador = new CargadorPrompts();
  cargador.onModuleInit();
  const compacto = { ejecutar: () => Promise.resolve(catalogo) } as unknown as ObtenerCatalogoCompacto;
  const horario: Horario = { estaDentroDeHorario: () => Promise.resolve(dentroDeHorario) };
  // El proveedor entrega por defecto el estilo del archivo (origen `archivo`); cada test lo cambia si lo necesita.
  const vigente: EstiloVigente = { texto: cargador.estilo, version: 0, origen: 'archivo', ...estilo };
  const proveedor = { obtener: () => Promise.resolve(vigente) } as unknown as ProveedorEstilo;
  const entrega: CasosDelPrompt = 'conTextos' in delPrompt ? delPrompt : { conTextos: false, casos: delPrompt };
  const casos = { casosDelPrompt: () => Promise.resolve(entrega) } as unknown as ConsultaCasos;
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

  it('AGT13 — El estilo va entre la seguridad y el catálogo', async () => {
    const { ensamblar, cargador } = crear(CATALOGO, true, { texto: 'ESTILO-DE-LA-BASE: sé breve.', version: 3, origen: 'base' });

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: ['INSTRUCCION-DEL-TURNO'] });

    const posSeguridad = texto.indexOf(cargador.seguridad.trim());
    const posEstilo = texto.indexOf('ESTILO-DE-LA-BASE');
    const posCatalogo = texto.indexOf(CATALOGO);
    const posTurno = texto.indexOf('INSTRUCCION-DEL-TURNO');
    expect(posSeguridad).toBe(0);
    expect(posEstilo).toBeGreaterThan(posSeguridad);
    expect(posCatalogo).toBeGreaterThan(posEstilo);
    expect(posTurno).toBeGreaterThan(posCatalogo);
  });

  it('AGT13 — Cambiar el estilo no cambia la seguridad', async () => {
    const base = crear();
    const alterno = crear(CATALOGO, true, { texto: 'ESTILO-ALTERNO: usa un tono muy formal.', version: 2, origen: 'base' });

    const a = await base.ensamblar.ensamblar({ instruccionesTurno: [] });
    const b = await alterno.ensamblar.ensamblar({ instruccionesTurno: [] });

    const finSeguridad = a.texto.indexOf(base.cargador.seguridad.trim()) + base.cargador.seguridad.trim().length;
    expect(finSeguridad).toBeGreaterThan(100);
    expect(b.texto.slice(0, finSeguridad)).toBe(a.texto.slice(0, finSeguridad));
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

    expect(resultado).toMatchObject({ version: 'v8', versionEstilo: 5 });
    expect(JSON.stringify({ version: resultado.version, versionEstilo: resultado.versionEstilo })).not.toContain('ESTILO-PUBLICADO');
  });

  it('AGT13 — La seguridad no trae reglas de negocio ni títulos de casos', () => {
    const { cargador } = crear();
    const seguridad = normalizarTexto(cargador.seguridad);

    for (const prohibido of ['foto', 'aproximado', 'contra entrega', 'cobertura', 'ubicacion', 'salud']) {
      expect(seguridad).not.toContain(prohibido);
    }
    expect(seguridad).not.toMatch(/# herramientas/);
    expect(cargador.seguridad).not.toMatch(/emoji/i);
    for (const titulo of ['Garantía', 'Medios de pago', 'Fotos', 'Saludo', 'Tratamiento de datos']) {
      expect(seguridad).not.toContain(normalizarTexto(titulo));
    }
  });

  it('AGT13 — La seguridad trae exactamente seis límites', () => {
    const { cargador } = crear();
    const limites = cargador.seguridad.split('\n').filter((linea) => /^\d+\. /.test(linea));

    expect(limites).toHaveLength(6);
    expect(cargador.seguridad).toMatch(/herramienta llamada en este turno/i);
    expect(cargador.seguridad).toMatch(/política sale de un caso de uso/i);
    expect(cargador.seguridad).toMatch(/Nunca calcules/);
    expect(cargador.seguridad).toMatch(/modo `literal`/);
    expect(cargador.seguridad).toMatch(/modo `guia`/);
    expect(cargador.seguridad).toMatch(/códigos internos/i);
    expect(cargador.seguridad).toMatch(/no puedes ver imágenes/i);
  });

  it('AGT24 — La parte fija del prompt nombra la herramienta solo ante un dato que falta', async () => {
    const { ensamblar, cargador } = crear();

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    const reglas = cargador.seguridad.split('\n').filter((linea) => linea.includes('derivar_a_asesor'));
    expect(reglas).toHaveLength(1);
    expect(reglas[0]).toMatch(/^4\. /);
    expect(reglas[0]).toMatch(/no tienes el dato/i);
    expect(texto.split('derivar_a_asesor')).toHaveLength(2);
    expect(texto).not.toMatch(/traspas|handoff|pasar(lo)? a humano/i);
  });

  it('AGT13 — Sin secciones de estilo rige el respaldo mínimo', async () => {
    const { ensamblar, cargador } = crear();

    const { texto, versionEstilo } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(versionEstilo).toBe(0);
    expect(cargador.estilo.trim()).toBe('Eres un asistente de atención por chat. Responde en español, con mensajes cortos y claros.');
    expect(texto).toContain(cargador.estilo.trim());
    expect(cargador.estilo).not.toMatch(/(nunca|no |sin |jamás)/i);
  });

  it('AGT13 — El prompt pide en un mismo paso las herramientas independientes', async () => {
    const { ensamblar, cargador } = crear();

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(cargador.turno).toMatch(/varias herramientas que no dependen una de otra/);
    expect(cargador.turno).toMatch(/en el mismo paso/);
    expect(texto).toMatch(/varias herramientas que no dependen una de otra/);
    expect(cargador.seguridad).not.toMatch(/mismo paso/);
  });

  it('AGT13 — El prompt pide responder las preguntas generales del catálogo con la lista que ya trae', async () => {
    const { ensamblar, cargador } = crear();

    const { texto, version } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(cargador.turno).toMatch(/preguntas generales sobre el catálogo/);
    expect(cargador.turno).toMatch(/sección «Catálogo»/);
    expect(texto).toMatch(/preguntas generales sobre el catálogo/);
    expect(version).toBe('v8');
    expect(cargador.seguridad).not.toMatch(/catálogo/i);
  });

  it('la parte variable dice si es horario de atención', async () => {
    const dentro = await crear(CATALOGO, true).ensamblar.ensamblar({ instruccionesTurno: [] });
    const fuera = await crear(CATALOGO, false).ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(dentro.texto).toContain('dentro del horario');
    expect(fuera.texto).toContain('fuera del horario');
  });

  it('entrega la versión del prompt para el log del turno', async () => {
    const { ensamblar } = crear();

    await expect(ensamblar.ensamblar({ instruccionesTurno: [] })).resolves.toMatchObject({ version: 'v8' });
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

  const CON_TEXTOS: CasosDelPrompt = {
    conTextos: true,
    casos: [
      { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan por la garantía.', modo: 'literal', texto: 'Cubre 8 días.\nSin uso.' },
      { titulo: 'Saludo', cuandoAplica: 'Al empezar la conversación.', modo: 'guia', texto: 'Saluda con calidez.' },
    ],
  };

  it('CAS8 — Con textos que caben, cada caso trae su texto y su modo como los devolvería consultar_caso', async () => {
    const { ensamblar } = crear(CATALOGO, true, undefined, CON_TEXTOS);

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    const literal = JSON.stringify({ encontrado: true, titulo: 'Garantía', modo: 'literal', texto: 'Cubre 8 días.\nSin uso.' });
    const guia = JSON.stringify({ encontrado: true, titulo: 'Saludo', modo: 'guia', texto: 'Saluda con calidez.' });
    expect(texto).toContain(`- Garantía: Cuando preguntan por la garantía.\n  ${literal}`);
    expect(texto).toContain(`- Saludo: Al empezar la conversación.\n  ${guia}`);
    expect(texto).toMatch(/ya traen su texto/i);
  });

  it('CAS8 — Los textos de los casos van en la parte estable, antes del catálogo', async () => {
    const { ensamblar } = crear(CATALOGO, true, undefined, CON_TEXTOS);

    const a = await ensamblar.ensamblar({ instruccionesTurno: ['El cliente se llama Laura.'] });
    const b = await ensamblar.ensamblar({ instruccionesTurno: [] });

    const fin = a.texto.indexOf(CATALOGO) + CATALOGO.length;
    expect(a.texto.indexOf('Saluda con calidez.')).toBeLessThan(a.texto.indexOf(CATALOGO));
    expect(b.texto.slice(0, fin)).toBe(a.texto.slice(0, fin));
  });

  it('CAS8 — Si los textos no caben, el prompt lleva solo el índice y pide consultar_caso', async () => {
    const { ensamblar } = crear(CATALOGO, true, undefined, INDICE);

    const { texto } = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(texto).toContain('- Garantía: Cuando el cliente pregunta por la garantía.');
    expect(texto).not.toContain('"encontrado"');
    expect(texto).toMatch(/Consulta un caso con `consultar_caso`/);
  });

  it('EST-S1 — El prompt con las secciones sembradas es idéntico al del estilo inicial', async () => {
    const inicial = readFileSync(path.join(import.meta.dirname, '../../../../prisma/datos/estilo-inicial.md'), 'utf8');
    const sembradas = componerEstilo(dividirEstilo(inicial).map((seccion, orden) => ({ ...seccion, orden, activo: true })));
    const delTexto = crear(CATALOGO, true, { texto: inicial, version: 1, origen: 'base' });
    const delasSecciones = crear(CATALOGO, true, { texto: sembradas, version: 1, origen: 'base' });

    const a = await delTexto.ensamblar.ensamblar({ instruccionesTurno: [] });
    const b = await delasSecciones.ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(b.texto).toBe(a.texto);
  });
});

describe('modulos/agente/aplicacion — EnsamblarPrompt: lecturas en paralelo (latencia)', () => {
  it('estilo, índice de casos, catálogo y horario se piden juntos', async () => {
    const cargador = new CargadorPrompts();
    cargador.onModuleInit();
    const pedidos: string[] = [];
    let liberarEstilo: (estilo: EstiloVigente) => void = () => undefined;
    const proveedor = {
      obtener: () => {
        pedidos.push('estilo');
        return new Promise<EstiloVigente>((resolver) => (liberarEstilo = resolver));
      },
    } as unknown as ProveedorEstilo;
    const casos = {
      casosDelPrompt: () => (pedidos.push('casos'), Promise.resolve({ conTextos: false, casos: [] })),
    } as unknown as ConsultaCasos;
    const compacto = { ejecutar: () => (pedidos.push('catalogo'), Promise.resolve(CATALOGO)) } as unknown as ObtenerCatalogoCompacto;
    const horario: Horario = { estaDentroDeHorario: () => (pedidos.push('horario'), Promise.resolve(true)) };
    const ensamblar = new EnsamblarPrompt(cargador, proveedor, compacto, horario, casos);

    const resultado = ensamblar.ensamblar({ instruccionesTurno: [] });
    await new Promise((resolver) => setImmediate(resolver));

    expect(pedidos).toEqual(['estilo', 'casos', 'catalogo', 'horario']);
    liberarEstilo({ texto: cargador.estilo, version: 0, origen: 'archivo' });
    await expect(resultado).resolves.toMatchObject({ versionEstilo: 0 });
  });
});

describe('modulos/agente/aplicacion — EnsamblarPrompt: clave de caché del proveedor (latencia)', () => {
  it('AGT13 — La clave de caché es la misma entre conversaciones y no lleva nada del turno', async () => {
    const { ensamblar } = crear(CATALOGO, true, { texto: 'estilo', version: 7, origen: 'base' });

    const a = await ensamblar.ensamblar({ instruccionesTurno: ['El cliente se llama Laura.'] });
    const b = await ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(a.claveCache).toBe(b.claveCache);
    expect(a.claveCache).toMatch(/^luxe-agente-[\w.-]+-e7$/);
    expect(a.claveCache).not.toContain('Laura');
  });

  it('cambiar la versión del estilo cambia la clave', async () => {
    const v1 = await crear(CATALOGO, true, { texto: 'estilo', version: 1, origen: 'base' }).ensamblar.ensamblar({ instruccionesTurno: [] });
    const v2 = await crear(CATALOGO, true, { texto: 'estilo', version: 2, origen: 'base' }).ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(v1.claveCache).not.toBe(v2.claveCache);
  });
});

