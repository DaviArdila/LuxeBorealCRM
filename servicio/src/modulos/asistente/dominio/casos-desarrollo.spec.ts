import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizarNombre } from './normalizar.js';
import { CASOS_DEL_SISTEMA } from './sistema.js';
import { CASOS_INICIALES_DE_INTENCION, leerArchivoDeCasos, planificarSemilla } from './semilla.js';

// Los casos de ejemplo del segmento (grifería, accesorios de baño y lavaplatos) viajan en un JSON de desarrollo que
// `npm run casos:sembrar -- --archivo` carga con las mismas reglas que la API (CAS5). Este test lo valida sin infraestructura.

const RUTA = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'datos-desarrollo', 'asistente', 'casos.json');
const contenido: unknown = JSON.parse(readFileSync(RUTA, 'utf8'));

const CATEGORIAS_NUEVAS = ['Producto y compatibilidad', 'Compra y pago', 'Envíos y pedidos', 'Posventa y reclamos', 'Obra y mayoristas', 'Facturación y datos'];

describe('Casos de desarrollo del segmento', () => {
  const lectura = leerArchivoDeCasos(contenido);

  it('el archivo pasa la validación de casos de la semilla', () => {
    expect(lectura).toMatchObject({ ok: true });
  });

  it('trae las seis categorías nuevas, los 16 casos de la tabla y el derecho de retracto, y conserva los 3 existentes', () => {
    if (!lectura.ok) throw new Error(lectura.motivo);

    const titulos = lectura.casos.map((caso) => caso.titulo);
    expect(titulos).toEqual(expect.arrayContaining(['Devoluciones', 'Garantía', 'Instalación', 'Derecho de retracto']));
    expect(lectura.casos).toHaveLength(3 + 1 + 16);
    expect(lectura.categorias.map((categoria) => categoria.nombre)).toEqual(CATEGORIAS_NUEVAS);
    expect(new Set(lectura.casos.map((caso) => caso.categoria))).toEqual(new Set(['Políticas', ...CATEGORIAS_NUEVAS]));
  });

  it('los casos nuevos son de intención y en modo guía, salvo los tres de siempre', () => {
    if (!lectura.ok) throw new Error(lectura.motivo);

    const existentes = new Set(['Devoluciones', 'Garantía', 'Instalación']);
    for (const caso of lectura.casos.filter((c) => !existentes.has(c.titulo))) {
      expect(caso.disparador).toBe('intencion');
      expect(caso.modo, caso.titulo).toBe('guia');
    }
  });

  it('los títulos son únicos tras normalizar y no chocan con los casos del sistema', () => {
    if (!lectura.ok) throw new Error(lectura.motivo);

    const normalizados = [...lectura.casos.map((caso) => caso.titulo), ...CASOS_DEL_SISTEMA.map((caso) => caso.titulo)].map(normalizarNombre);
    expect(new Set(normalizados).size).toBe(normalizados.length);
  });

  it('la semilla planifica el archivo completo sin perder ningún caso', () => {
    if (!lectura.ok) throw new Error(lectura.motivo);

    const plan = planificarSemilla(new Map(), lectura);

    expect(plan.casos).toHaveLength(CASOS_DEL_SISTEMA.length + CASOS_INICIALES_DE_INTENCION.length + lectura.casos.length);
    expect(plan.categorias.map((categoria) => categoria.nombre)).toEqual(expect.arrayContaining(CATEGORIAS_NUEVAS));
  });
});
