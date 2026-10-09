import { readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizarTexto } from '../../../compartido/texto/index.js';
import { componerEstilo, dividirEstilo } from '../dominio/secciones-estilo.js';
import type { ObtenerCatalogoCompacto } from '../../catalogo/index.js';
import type { ConsultaCasos, EntradaIndice } from '../../asistente/index.js';
import type { Horario } from '../../horario/index.js';
import { CargadorPrompts } from '../infraestructura/prompts/cargador-prompts.js';
import { EnsamblarPrompt } from './ensamblar-prompt.js';
import type { EstiloVigente, ProveedorEstilo } from './proveedor-estilo.js';

// Escenarios AGT13 y AGT24 del delta de `openspec/changes/fase-12d-derivar-sin-silencio/specs/agente/spec.md`.

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

    expect(resultado).toMatchObject({ version: 'v5', versionEstilo: 5 });
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

  it('la parte variable dice si es horario de atención', async () => {
    const dentro = await crear(CATALOGO, true).ensamblar.ensamblar({ instruccionesTurno: [] });
    const fuera = await crear(CATALOGO, false).ensamblar.ensamblar({ instruccionesTurno: [] });

    expect(dentro.texto).toContain('dentro del horario');
    expect(fuera.texto).toContain('fuera del horario');
  });

  it('entrega la versión del prompt para el log del turno', async () => {
    const { ensamblar } = crear();

    await expect(ensamblar.ensamblar({ instruccionesTurno: [] })).resolves.toMatchObject({ version: 'v5' });
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
