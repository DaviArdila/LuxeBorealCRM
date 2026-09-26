import { describe, expect, it } from 'vitest';
import { validarCatalogoCompleto, type FilaCruda, type NombrePestana } from './validar-catalogo.js';
import type { CatalogoLugares } from './resolver-lugar.js';

function lugares(): CatalogoLugares {
  return {
    departamentos: [
      { id: '05', nombre: 'Antioquia' },
      { id: '27', nombre: 'Chocó' },
    ],
    ciudades: [
      { id: '05001', departamentoId: '05', nombre: 'Medellín' },
      { id: '27001', departamentoId: '27', nombre: 'Quibdó' },
    ],
  };
}

const HOY = new Date('2026-09-26T12:00:00Z');

const PRODUCTO_OK: FilaCruda = {
  sku: 'SKU-LAMP-0001',
  nombre: 'Lámpara de mesa',
  descripcion_corta: 'Luz cálida',
  descripcion_larga: 'Lámpara con luz cálida.',
  precio_cop: '89000',
  activo: '',
  fotos: 'https://drive.google.com/file/d/abc/view',
};

const TARIFA_OK: FilaCruda = {
  departamento: 'Antioquia',
  ciudad: '',
  peso_min_g: '',
  peso_max_g: '',
  rango_min_cop: '30000',
  rango_max_cop: '40000',
  dias_min: '3',
  dias_max: '5',
  contraentrega: 'si',
};

function crudo(parcial: Partial<Record<NombrePestana, readonly FilaCruda[]>> = {}): Record<NombrePestana, readonly FilaCruda[]> {
  return {
    productos: [PRODUCTO_OK],
    tarifas: [],
    cobertura: [],
    parametros: [],
    excepciones_horario: [],
    ...parcial,
  };
}

function errorEn(r: ReturnType<typeof validarCatalogoCompleto>, columna: string) {
  return r.errores.find((e) => e.columna === columna);
}

describe('catalogo/dominio/validar-catalogo', () => {
  describe('IMP3 — validación de los campos obligatorios de un producto', () => {
    it('IMP3 — Un SKU vacío o con una forma distinta a SKU-XXXX es un error', () => {
      const r1 = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, sku: '' }] }), lugares(), HOY);
      expect(errorEn(r1, 'sku')).toBeDefined();

      const r2 = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, sku: 'lampara-1' }] }), lugares(), HOY);
      expect(errorEn(r2, 'sku')).toBeDefined();
    });

    it('IMP3 — Un SKU repetido en dos filas es un error que cita la primera fila', () => {
      const r = validarCatalogoCompleto(
        crudo({ productos: [PRODUCTO_OK, { ...PRODUCTO_OK, sku: 'sku-lamp-0001' }] }),
        lugares(),
        HOY,
      );

      const error = errorEn(r, 'sku');
      expect(error).toMatchObject({ fila: 2 });
      expect(error?.mensaje).toContain('1');
    });

    it('IMP3 — Un nombre o una descripción fuera de los límites de las listas de WhatsApp es un error', () => {
      const nombreVacio = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, nombre: '' }] }), lugares(), HOY);
      expect(errorEn(nombreVacio, 'nombre')).toBeDefined();

      const nombreLargo = validarCatalogoCompleto(
        crudo({ productos: [{ ...PRODUCTO_OK, nombre: 'Una lámpara con un nombre demasiado largo' }] }),
        lugares(),
        HOY,
      );
      expect(errorEn(nombreLargo, 'nombre')).toBeDefined();

      const cortaVacia = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, descripcion_corta: '' }] }), lugares(), HOY);
      expect(errorEn(cortaVacia, 'descripcion_corta')).toBeDefined();

      const cortaLarga = validarCatalogoCompleto(
        crudo({ productos: [{ ...PRODUCTO_OK, descripcion_corta: 'x'.repeat(73) }] }),
        lugares(),
        HOY,
      );
      expect(errorEn(cortaLarga, 'descripcion_corta')).toBeDefined();

      const largaVacia = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, descripcion_larga: '' }] }), lugares(), HOY);
      expect(errorEn(largaVacia, 'descripcion_larga')).toBeDefined();
    });

    it('IMP3 — Un precio que no es un entero positivo es un error', () => {
      const vacio = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, precio_cop: '' }] }), lugares(), HOY);
      expect(errorEn(vacio, 'precio_cop')).toBeDefined();

      const noNumerico = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, precio_cop: 'ochenta mil' }] }), lugares(), HOY);
      expect(errorEn(noNumerico, 'precio_cop')).toBeDefined();

      const conDecimales = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, precio_cop: '89.5' }] }), lugares(), HOY);
      expect(errorEn(conDecimales, 'precio_cop')).toBeDefined();

      const cero = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, precio_cop: '0' }] }), lugares(), HOY);
      expect(errorEn(cero, 'precio_cop')).toBeDefined();
    });
  });

  describe('IMP4 — validación de las fotos de un producto activo', () => {
    it('IMP4 — Un producto activo sin fotos o con más de 6 es un error', () => {
      const sinFotos = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, fotos: '' }] }), lugares(), HOY);
      expect(errorEn(sinFotos, 'fotos')).toBeDefined();

      const masDeSeis = validarCatalogoCompleto(
        crudo({ productos: [{ ...PRODUCTO_OK, fotos: Array(7).fill('https://x/a.jpg').join(',') }] }),
        lugares(),
        HOY,
      );
      expect(errorEn(masDeSeis, 'fotos')).toBeDefined();
    });

    it('IMP4 — Un enlace de foto que no es http(s) es un error', () => {
      const r = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, fotos: 'C:\\fotos\\a.jpg' }] }), lugares(), HOY);

      const error = errorEn(r, 'fotos');
      expect(error?.mensaje).toContain('C:\\fotos\\a.jpg');
    });

    it('IMP4 — Un producto inactivo no necesita ninguna foto', () => {
      const r = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, activo: 'no', fotos: '' }] }), lugares(), HOY);

      expect(errorEn(r, 'fotos')).toBeUndefined();
      expect(r.datos?.productos[0]).toMatchObject({ activo: false, fotos: [] });
    });
  });

  describe('IMP5 — peso y medidas del producto son opcionales pero enteros cuando se informan', () => {
    it('IMP5 — Peso y medidas vacíos se aceptan sin error', () => {
      const r = validarCatalogoCompleto(crudo(), lugares(), HOY);

      expect(r.valido).toBe(true);
      expect(r.datos?.productos[0]).toMatchObject({ pesoGramos: null, largoMm: null, anchoMm: null, altoMm: null });
    });

    it('IMP5 — Un peso o medida que no es un entero es un error en su columna', () => {
      const r = validarCatalogoCompleto(crudo({ productos: [{ ...PRODUCTO_OK, peso_gramos: '1,2 kg' }] }), lugares(), HOY);

      expect(errorEn(r, 'peso_gramos')).toBeDefined();
    });
  });

  describe('IMP6 — validación de las franjas de peso y del rango de una tarifa', () => {
    it('IMP6 — Una franja de peso, un rango de precio o un rango de días invertido es un error', () => {
      const pesoInvertido = validarCatalogoCompleto(
        crudo({ tarifas: [{ ...TARIFA_OK, peso_min_g: '9000', peso_max_g: '5000' }] }),
        lugares(),
        HOY,
      );
      expect(errorEn(pesoInvertido, 'peso_min_g')).toBeDefined();

      const rangoInvertido = validarCatalogoCompleto(
        crudo({ tarifas: [{ ...TARIFA_OK, rango_min_cop: '50000', rango_max_cop: '40000' }] }),
        lugares(),
        HOY,
      );
      expect(errorEn(rangoInvertido, 'rango_min_cop')).toBeDefined();

      const diasInvertido = validarCatalogoCompleto(
        crudo({ tarifas: [{ ...TARIFA_OK, dias_min: '9', dias_max: '5' }] }),
        lugares(),
        HOY,
      );
      expect(errorEn(diasInvertido, 'dias_min')).toBeDefined();
    });

    it('IMP6 — Dos tarifas con franjas de peso distintas para el mismo destino conviven sin error', () => {
      const r = validarCatalogoCompleto(
        crudo({
          tarifas: [
            { ...TARIFA_OK, peso_min_g: '0', peso_max_g: '5000' },
            { ...TARIFA_OK, peso_min_g: '5001', peso_max_g: '' },
          ],
        }),
        lugares(),
        HOY,
      );

      expect(r.errores).toEqual([]);
      expect(r.datos?.tarifas).toHaveLength(2);
    });

    it('IMP6 — Dos tarifas con la misma franja de peso para el mismo destino son un error de solape', () => {
      const r = validarCatalogoCompleto(
        crudo({
          tarifas: [
            { ...TARIFA_OK, peso_min_g: '0', peso_max_g: '5000' },
            { ...TARIFA_OK, peso_min_g: '0', peso_max_g: '5000' },
          ],
        }),
        lugares(),
        HOY,
      );

      expect(r.errores.some((e) => e.mensaje.includes('solap'))).toBe(true);
    });
  });

  describe('IMP7 — serialización de un parámetro a jsonb, y advertencia para clave desconocida', () => {
    it('IMP7 — horario_atencion con JSON válido se guarda como objeto jsonb', () => {
      const r = validarCatalogoCompleto(
        crudo({ parametros: [{ clave: 'horario_atencion', valor: '{"lun-vie":"08:00-18:00","dom":null}' }] }),
        lugares(),
        HOY,
      );

      expect(r.errores).toEqual([]);
      expect(r.datos?.parametros[0]).toEqual({ clave: 'horario_atencion', valor: { 'lun-vie': '08:00-18:00', dom: null } });
    });

    it('IMP7 — horario_atencion con un valor que no es JSON válido es un error', () => {
      const r = validarCatalogoCompleto(crudo({ parametros: [{ clave: 'horario_atencion', valor: '8 a 6' }] }), lugares(), HOY);

      expect(errorEn(r, 'valor')).toBeDefined();
    });

    it('IMP7 — recargo_contraentrega_pct y factor_volumetrico se guardan como número jsonb', () => {
      const r = validarCatalogoCompleto(
        crudo({
          parametros: [
            { clave: 'recargo_contraentrega_pct', valor: '5' },
            { clave: 'factor_volumetrico', valor: '4000' },
          ],
        }),
        lugares(),
        HOY,
      );

      expect(r.errores).toEqual([]);
      expect(r.datos?.parametros).toEqual([
        { clave: 'recargo_contraentrega_pct', valor: 5 },
        { clave: 'factor_volumetrico', valor: 4000 },
      ]);
    });

    it('IMP7 — recargo_contraentrega_pct o factor_volumetrico no numérico es un error', () => {
      const r = validarCatalogoCompleto(crudo({ parametros: [{ clave: 'factor_volumetrico', valor: 'cuatro mil' }] }), lugares(), HOY);

      expect(errorEn(r, 'valor')).toBeDefined();
    });

    it('IMP7 — Una clave desconocida solo genera una advertencia y se guarda tal cual', () => {
      const r = validarCatalogoCompleto(crudo({ parametros: [{ clave: 'color_favorito', valor: 'azul' }] }), lugares(), HOY);

      expect(r.errores).toEqual([]);
      expect(r.advertencias.some((a) => a.mensaje.includes('color_favorito'))).toBe(true);
      expect(r.datos?.parametros[0]).toEqual({ clave: 'color_favorito', valor: 'azul' });
    });
  });

  describe('IMP8 — fecha de excepción de horario parseable', () => {
    it('IMP8 — Una fecha en formato YYYY-MM-DD o DD/MM/YYYY se acepta', () => {
      const r = validarCatalogoCompleto(
        crudo({
          excepciones_horario: [
            { fecha: '2026-12-25', motivo: 'Navidad' },
            { fecha: '31/12/2026', motivo: '' },
          ],
        }),
        lugares(),
        HOY,
      );

      expect(r.errores).toEqual([]);
      expect(r.datos?.excepciones).toHaveLength(2);
    });

    it('IMP8 — Una fecha que no existe en el calendario es un error', () => {
      const r = validarCatalogoCompleto(crudo({ excepciones_horario: [{ fecha: '2026-02-30', motivo: '' }] }), lugares(), HOY);

      expect(errorEn(r, 'fecha')).toBeDefined();
    });
  });

  // Tests de soporte (no forman parte de los 19 escenarios exigidos por tasks.md, pero verifican la
  // integración con resolverLugar/IMP9 y con el registro de parsers que el resto de escenarios ejercitan
  // solo indirectamente).
  describe('soporte — integración con resolverLugar (IMP9) y con hoy inyectado', () => {
    it('tarifas — un departamento sin match en geografia es una fila inválida', () => {
      const r = validarCatalogoCompleto(crudo({ tarifas: [{ ...TARIFA_OK, departamento: 'Antioqia' }] }), lugares(), HOY);

      expect(errorEn(r, 'departamento')?.mensaje).toContain('Antioqia');
      expect(r.valido).toBe(false);
      expect(r.datos).toBeNull();
    });

    it('cobertura — una fila con departamento y ciudad resuelve a su código DANE', () => {
      const r = validarCatalogoCompleto(
        crudo({ cobertura: [{ departamento: 'Chocó', ciudad: '', motivo: 'sin transportadora' }] }),
        lugares(),
        HOY,
      );

      expect(r.errores).toEqual([]);
      expect(r.datos?.zonasSinCobertura[0]).toEqual({ departamentoId: '27', ciudadId: null, motivo: 'sin transportadora' });
    });

    it('excepciones_horario — una fecha ya pasada respecto a hoy solo genera advertencia, nunca error', () => {
      const r = validarCatalogoCompleto(crudo({ excepciones_horario: [{ fecha: '2026-01-01', motivo: '' }] }), lugares(), HOY);

      expect(r.errores).toEqual([]);
      expect(r.advertencias.some((a) => a.mensaje.includes('ya pasó'))).toBe(true);
    });
  });
});
