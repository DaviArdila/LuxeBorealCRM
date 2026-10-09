import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASOS_DEL_SISTEMA, textoDeRespaldo } from './sistema.js';
import { CASOS_INICIALES_DE_INTENCION, leerArchivoDeCasos, planificarSemilla } from './semilla.js';
import { validarCaso } from './validar-caso.js';

// CAS6 (Fase 12, T4): qué casos crea la semilla a partir de lo que ya hay en `parametro` y del código.

function filas(objeto: Record<string, unknown>): ReadonlyMap<string, unknown> {
  return new Map(Object.entries(objeto));
}

describe('planificarSemilla (CAS6)', () => {
  it('sin nada en parametro: los casos del sistema que quedan con su respaldo y el caso inicial de intención, en las categorías Sistema y Políticas', () => {
    const plan = planificarSemilla(filas({}));

    expect(plan.categorias.map((c) => [c.nombre, c.orden])).toEqual([
      ['Sistema', 0],
      ['Políticas', 1],
    ]);
    expect(plan.casos).toHaveLength(CASOS_DEL_SISTEMA.length + 1);
    for (const definicion of CASOS_DEL_SISTEMA) {
      const caso = plan.casos.find((c) => c.claveSistema === definicion.clave);
      expect(caso?.texto, definicion.clave).toBe(textoDeRespaldo(definicion.clave));
      expect(caso?.claveParametro, definicion.clave).toBeNull();
    }
    expect(plan.casos.find((c) => c.claveSistema === 'mensaje_espera_handoff')).toMatchObject({
      categoria: 'Sistema',
      disparador: 'evento',
      modo: 'literal',
    });
  });

  it('CAS6 — Sembrar no crea casos de negocio en una base nueva', () => {
    const plan = planificarSemilla(filas({}));

    expect(plan.casos.filter((c) => c.disparador === 'intencion').map((c) => c.titulo)).toEqual([TRATAMIENTO_DE_DATOS]);
    const titulos = plan.casos.map((c) => c.titulo);
    expect(titulos).not.toContain('Contra entrega');
    expect(titulos).not.toContain('Sin cobertura de envío');
    expect(titulos).not.toContain('Datos completos fuera de horario');
    expect(plan.casos.map((c) => c.claveSistema)).not.toContain('contra_entrega');
  });

  it('CAS6 — La semilla no vuelve a crear como casos del sistema los tres que se convirtieron', () => {
    const plan = planificarSemilla(filas({ mensaje_fuera_cobertura: 'Texto viejo.', mensaje_captura_completa: 'Texto viejo.' }));

    const claves: readonly (string | null)[] = plan.casos.map((c) => c.claveSistema);
    expect(claves).not.toContain('mensaje_fuera_cobertura');
    expect(claves).not.toContain('mensaje_captura_completa');
    expect(claves).not.toContain('contra_entrega');
  });

  it('CAS6 — Sembrar copia los textos que ya estaban editados', () => {
    const plan = planificarSemilla(filas({ mensaje_espera_handoff: '  Texto propio del negocio.  ' }));

    const caso = plan.casos.find((c) => c.claveSistema === 'mensaje_espera_handoff');
    expect(caso).toMatchObject({ texto: 'Texto propio del negocio.', claveParametro: 'mensaje_espera_handoff' });
  });

  it('CAS6 — Un valor de parametro en blanco o que no es texto se ignora y rige el respaldo', () => {
    const plan = planificarSemilla(filas({ mensaje_techo_gasto: '   ', mensaje_error_llm: 42 }));

    expect(plan.casos.find((c) => c.claveSistema === 'mensaje_techo_gasto')).toMatchObject({
      texto: textoDeRespaldo('mensaje_techo_gasto'),
      claveParametro: null,
    });
    expect(plan.casos.find((c) => c.claveSistema === 'mensaje_error_llm')?.texto).toBe(textoDeRespaldo('mensaje_error_llm'));
  });

  it('CAS6 — politica_contra_entrega ya no es del sistema: se siembra como una política más', () => {
    const plan = planificarSemilla(filas({ politica_contra_entrega: 'Pagas al recibir.' }));

    expect(plan.casos.find((c) => c.claveParametro === 'politica_contra_entrega')).toMatchObject({
      titulo: 'Contra entrega',
      claveSistema: null,
      disparador: 'intencion',
      categoria: 'Políticas',
      texto: 'Pagas al recibir.',
    });
  });

  it('CAS6 — Sembrar convierte las políticas existentes en casos de intención', () => {
    const plan = planificarSemilla(
      filas({
        politica_devoluciones: 'Aceptamos devoluciones en ocho días.',
        politica_garantia: 'La garantía cubre defectos de fábrica.',
        politica_instalacion: 'La instalación va por cuenta del cliente.',
      }),
    );

    const politicas = plan.casos.filter((c) => c.claveSistema === null && c.titulo !== TRATAMIENTO_DE_DATOS);
    expect(politicas.map((c) => [c.titulo, c.categoria, c.disparador, c.modo, c.claveParametro])).toEqual([
      ['Devoluciones', 'Políticas', 'intencion', 'literal', 'politica_devoluciones'],
      ['Garantía', 'Políticas', 'intencion', 'literal', 'politica_garantia'],
      ['Instalación', 'Políticas', 'intencion', 'literal', 'politica_instalacion'],
    ]);
    expect(politicas[1]?.cuandoAplica).toBe('Cuando el cliente pregunta por garantía.');
    expect(politicas[1]?.texto).toBe('La garantía cubre defectos de fábrica.');
  });

  it('un tema nuevo toma su título del nombre de la clave', () => {
    const plan = planificarSemilla(filas({ politica_medios_de_pago: 'Aceptamos transferencia.' }));

    expect(plan.casos.find((c) => c.claveParametro === 'politica_medios_de_pago')).toMatchObject({
      titulo: 'Medios de pago',
    });
  });

  it('una política con valor en blanco o que no es texto no crea un caso', () => {
    const plan = planificarSemilla(filas({ politica_vacia: ' ', politica_numero: 3 }));

    expect(plan.casos.filter((c) => c.claveSistema === null).map((c) => c.titulo)).toEqual([TRATAMIENTO_DE_DATOS]);
  });
});

const TRATAMIENTO_DE_DATOS = 'Tratamiento de datos';

describe('«Tratamiento de datos», el único caso de uso que se siembra (CAS13)', () => {
  it('CAS13 — Una base nueva tiene un solo caso de uso inicial', () => {
    const plan = planificarSemilla(filas({}));

    expect(CASOS_INICIALES_DE_INTENCION).toHaveLength(1);
    const deIntencionSinClave = plan.casos.filter((c) => c.claveSistema === null);
    expect(deIntencionSinClave).toHaveLength(1);
    expect(deIntencionSinClave[0]).toMatchObject({
      titulo: TRATAMIENTO_DE_DATOS,
      categoria: 'Políticas',
      disparador: 'intencion',
      modo: 'guia',
      claveParametro: null,
    });
  });

  it('CAS13 — Su «cuándo aplica» nombra la señal: tomar datos o registrar el interés con el consentimiento pendiente', () => {
    const [caso] = CASOS_INICIALES_DE_INTENCION;

    expect(caso?.cuandoAplica).toMatch(/datos de despacho/);
    expect(caso?.cuandoAplica).toMatch(/inter[eé]s de compra/);
    expect(caso?.cuandoAplica).toMatch(/consentimiento/);
  });

  it('CAS13 — El texto inicial cumple la validación de casos', () => {
    const [caso] = CASOS_INICIALES_DE_INTENCION;

    expect(caso).toBeDefined();
    expect(validarCaso({ titulo: caso?.titulo ?? '', cuandoAplica: caso?.cuandoAplica ?? '', texto: caso?.texto ?? '', modo: 'guia', disparador: 'intencion', claveSistema: null })).toEqual({ valido: true });
  });

  it('CAS13 — El texto inicial se presenta como asistente y pide la aceptación', () => {
    const [caso] = CASOS_INICIALES_DE_INTENCION;
    const texto = caso?.texto ?? '';

    expect(texto).toMatch(/asistente automatizado/i);
    expect(texto.trim().endsWith('?')).toBe(true);
    expect(texto).toMatch(/acept/i);
  });

  it('CAS13 — Si parametro todavía guarda el texto de aviso_datos, el caso lo conserva y lo retira', () => {
    const plan = planificarSemilla(filas({ aviso_datos: '  Texto aprobado por el negocio.  ' }));

    expect(plan.casos.find((c) => c.titulo === TRATAMIENTO_DE_DATOS)).toMatchObject({
      texto: 'Texto aprobado por el negocio.',
      claveParametro: 'aviso_datos',
    });
  });

  describe('prioridad del texto: fila de sistema legada aviso_datos, luego parametro, luego respaldo', () => {
    const tratamiento = (plan: ReturnType<typeof planificarSemilla>) => plan.casos.find((c) => c.titulo === TRATAMIENTO_DE_DATOS);

    it('CAS13 — Con la fila de sistema legada aviso_datos editada, «Tratamiento de datos» nace con ese texto', () => {
      const plan = planificarSemilla(filas({ aviso_datos: 'Texto viejo de parametro. ¿Aceptas?' }), undefined, '  Texto del dueño. ¿Aceptas?  ');

      expect(tratamiento(plan)).toMatchObject({ texto: 'Texto del dueño. ¿Aceptas?', origenTexto: 'caso-del-sistema', claveParametro: null });
    });

    it('CAS13 — Un texto legado que no cumple CAS5 cae al parametro', () => {
      const plan = planificarSemilla(filas({ aviso_datos: 'Texto de parametro. ¿Aceptas?' }), undefined, 'Cuesta $50.000, ¿aceptas?');

      expect(tratamiento(plan)).toMatchObject({ texto: 'Texto de parametro. ¿Aceptas?', origenTexto: 'parametro', claveParametro: 'aviso_datos' });
    });

    it('CAS13 — Si tampoco hay un parametro válido rige el texto de respaldo', () => {
      const plan = planificarSemilla(filas({ aviso_datos: '   ' }), undefined, '{{marcador}}');

      expect(tratamiento(plan)).toMatchObject({ texto: CASOS_INICIALES_DE_INTENCION[0]?.texto, origenTexto: 'respaldo', claveParametro: null });
    });

    it('CAS13 — Sin fila legada ni parametro rige el respaldo', () => {
      expect(tratamiento(planificarSemilla(filas({}), undefined, null))).toMatchObject({ origenTexto: 'respaldo' });
    });

    it('CAS4 — El plan no trae un caso del sistema aviso_datos: la lista queda en cinco', () => {
      const plan = planificarSemilla(filas({ aviso_datos: 'Texto del dueño. ¿Aceptas?' }), undefined, 'Texto del dueño. ¿Aceptas?');

      expect(plan.casos.map((c) => c.claveSistema)).not.toContain('aviso_datos');
    });
  });
});

describe('leerArchivoDeCasos (CAS6, datos de desarrollo)', () => {
  const VALIDO = {
    casos: [
      { categoria: 'Políticas', titulo: 'Devoluciones', cuandoAplica: 'Cuando preguntan por devoluciones.', texto: 'Aceptamos devoluciones en 8 días.' },
      { categoria: 'Envíos', titulo: 'Tiempos de entrega', cuandoAplica: 'Cuando preguntan cuánto tarda.', texto: 'Entre 2 y 5 días hábiles.', modo: 'guia' },
    ],
  };

  it('CAS6 — Un archivo válido se convierte en casos de intención sin clave de parámetro', () => {
    const resultado = leerArchivoDeCasos(VALIDO);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.casos[0]).toMatchObject({ claveSistema: null, disparador: 'intencion', modo: 'literal', claveParametro: null, categoria: 'Políticas' });
    expect(resultado.casos[1]).toMatchObject({ modo: 'guia', categoria: 'Envíos' });
  });

  it('CAS6 — Las categorías nuevas del archivo se agregan al final del orden', () => {
    const resultado = leerArchivoDeCasos(VALIDO);

    expect(resultado.ok && resultado.categorias.map((c) => c.nombre)).toEqual(['Envíos']);
    expect(planificarSemilla(new Map(), resultado.ok ? resultado : undefined).categorias.map((c) => [c.nombre, c.orden])).toEqual([
      ['Sistema', 0],
      ['Políticas', 1],
      ['Envíos', 2],
    ]);
  });

  it('CAS5 — Un caso del archivo que incumple las reglas del caso invalida todo el archivo y nombra la posición', () => {
    const resultado = leerArchivoDeCasos({ casos: [VALIDO.casos[0], { ...VALIDO.casos[1], texto: 'Cuesta $50.000.' }] });

    expect(resultado).toMatchObject({ ok: false });
    expect(resultado.ok ? '' : resultado.motivo).toContain('caso 2');
    expect(resultado.ok ? '' : resultado.motivo).not.toContain('50.000');
  });

  it('un archivo con otra forma se rechaza con un motivo claro', () => {
    expect(leerArchivoDeCasos({})).toMatchObject({ ok: false });
    expect(leerArchivoDeCasos({ casos: 'x' })).toMatchObject({ ok: false });
    expect(leerArchivoDeCasos({ casos: [{ titulo: 1 }] })).toMatchObject({ ok: false });
  });

  it('CAS6 — El archivo de casos de los datos de desarrollo es válido y trae las tres políticas', () => {
    const ruta = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'datos-desarrollo', 'asistente', 'casos.json');

    const resultado = leerArchivoDeCasos(JSON.parse(readFileSync(ruta, 'utf8')));

    // Las tres políticas de siempre abren el archivo; el resto del contenido lo cubre `casos-desarrollo.spec.ts`.
    expect(resultado.ok && resultado.casos.slice(0, 3).map((c) => c.titulo)).toEqual(['Devoluciones', 'Garantía', 'Instalación']);
  });
});
