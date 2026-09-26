import { formatearDias, formatearRangoCop } from '../../../compartido/dinero/index.js';
import {
  armarCotizacionConCobertura,
  elegirTarifa,
  hayExclusion,
  pesoFacturableG,
  type CandidataExclusion,
  type CandidataTarifa,
  type DestinoEnvio,
  type LineaPeso,
} from './envio.js';

function tarifa(overrides: Partial<CandidataTarifa> & { id: string }): CandidataTarifa {
  return {
    departamentoNombre: 'Antioquia',
    ciudadNombre: null,
    pesoMinG: 0,
    pesoMaxG: 50_000,
    rangoMinCop: 30000,
    rangoMaxCop: 40000,
    diasMin: 2,
    diasMax: 4,
    contraentregaDisponible: true,
    creado: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('catalogo/dominio/envio', () => {
  describe('CAT6 — peso facturable', () => {
    it('CAT6 — Gana el peso volumétrico cuando el producto es voluminoso y liviano', () => {
      const linea: LineaPeso = { cantidad: 1, pesoGramos: 800, largoMm: 300, anchoMm: 200, altoMm: 100 };

      expect(pesoFacturableG([linea], 4000)).toBe(1500);
    });

    it('CAT6 — Gana el peso real cuando el producto es denso, multiplicado por la cantidad', () => {
      const linea: LineaPeso = { cantidad: 3, pesoGramos: 5000, largoMm: 100, anchoMm: 100, altoMm: 100 };

      expect(pesoFacturableG([linea], 4000)).toBe(15000);
    });

    it('CAT6 — Un producto sin peso ni medidas pesa cero', () => {
      const linea: LineaPeso = { cantidad: 2, pesoGramos: null, largoMm: null, anchoMm: null, altoMm: null };

      expect(pesoFacturableG([linea], 4000)).toBe(0);
    });
  });

  describe('CAT7 — exclusión de cobertura', () => {
    it('CAT7 — Un destino en zona_sin_cobertura se trata como sin cobertura aunque exista una tarifa que calzaría', () => {
      const destino: DestinoEnvio = { departamento: 'Amazonas' };
      const exclusiones: CandidataExclusion[] = [{ departamentoNombre: 'Amazonas', ciudadNombre: null }];
      const candidatas: CandidataTarifa[] = [tarifa({ id: 'existe', departamentoNombre: 'Amazonas' })];

      expect(hayExclusion(exclusiones, destino)).toBe(true);
      // CAT7 antes que CAT8: si hay exclusión, la aplicación (T8) nunca llega a preguntar por
      // tarifa, aunque exista una que calzaría con el peso pedido.
      const resultado = hayExclusion(exclusiones, destino) ? undefined : elegirTarifa(candidatas, destino, 100);
      expect(resultado).toBeUndefined();
    });
  });

  describe('CAT8 — elección de tarifa por especificidad', () => {
    it('CAT8 — La ciudad exacta gana sobre la tarifa por defecto del departamento', () => {
      const porDefecto = tarifa({ id: 'defecto', departamentoNombre: 'Antioquia', ciudadNombre: null });
      const deMedellin = tarifa({ id: 'medellin', departamentoNombre: 'Antioquia', ciudadNombre: 'Medellín' });
      const destino: DestinoEnvio = { departamento: 'ANTIOQUIA', ciudad: 'medellin' };

      expect(elegirTarifa([porDefecto, deMedellin], destino, 100)?.id).toBe('medellin');
    });

    it('CAT8 — Una ciudad sin tarifa propia cae a la tarifa por defecto de su departamento', () => {
      const porDefecto = tarifa({ id: 'defecto', departamentoNombre: 'Antioquia', ciudadNombre: null });
      const destino: DestinoEnvio = { departamento: 'Antioquia', ciudad: 'Rionegro' };

      expect(elegirTarifa([porDefecto], destino, 100)?.id).toBe('defecto');
    });

    it('CAT8 — Una ciudad con tarifa propia que no cubre el peso cae a la tarifa del departamento', () => {
      const deMedellin = tarifa({
        id: 'medellin',
        departamentoNombre: 'Antioquia',
        ciudadNombre: 'Medellín',
        pesoMinG: 0,
        pesoMaxG: 1000,
      });
      const porDefecto = tarifa({
        id: 'defecto',
        departamentoNombre: 'Antioquia',
        ciudadNombre: null,
        pesoMinG: 0,
        pesoMaxG: 50_000,
      });
      const destino: DestinoEnvio = { departamento: 'Antioquia', ciudad: 'Medellín' };

      expect(elegirTarifa([deMedellin, porDefecto], destino, 3000)?.id).toBe('defecto');
    });

    it('CAT8 — Una ciudad-distrito registrada bajo otro departamento se resuelve por la ciudad', () => {
      const bogota = tarifa({ id: 'bogota', departamentoNombre: 'Bogotá D.C.', ciudadNombre: null });
      const destino: DestinoEnvio = { departamento: 'Cundinamarca', ciudad: 'Bogotá' };

      expect(elegirTarifa([bogota], destino, 100)?.id).toBe('bogota');
    });

    it('CAT8 — Se elige la franja de peso que contiene el peso facturable', () => {
      const liviana = tarifa({
        id: 'liviana',
        departamentoNombre: 'Antioquia',
        ciudadNombre: null,
        pesoMinG: 0,
        pesoMaxG: 5000,
      });
      const pesada = tarifa({
        id: 'pesada',
        departamentoNombre: 'Antioquia',
        ciudadNombre: null,
        pesoMinG: 5001,
        pesoMaxG: 50_000,
      });
      const destino: DestinoEnvio = { departamento: 'Antioquia' };

      expect(elegirTarifa([liviana, pesada], destino, 5001)?.id).toBe('pesada');
    });

    it('CAT8 — Sin ninguna tarifa que aplique, el resultado es sin cobertura', () => {
      const otraZona = tarifa({ id: 'otra', departamentoNombre: 'Antioquia', ciudadNombre: null });
      const destino: DestinoEnvio = { departamento: 'Putumayo' };

      expect(elegirTarifa([otraZona], destino, 100)).toBeUndefined();
    });

    it('D3 — Dos tarifas del mismo nivel con rangos de peso traslapados eligen la franja más angosta, y si empatan, la más antigua', () => {
      const angosta = tarifa({
        id: 'angosta',
        departamentoNombre: 'Valle',
        ciudadNombre: null,
        pesoMinG: 0,
        pesoMaxG: 10_000,
        creado: new Date('2026-01-01'),
      });
      const ancha = tarifa({
        id: 'ancha',
        departamentoNombre: 'Valle',
        ciudadNombre: null,
        pesoMinG: 0,
        pesoMaxG: 50_000,
        creado: new Date('2026-01-02'),
      });
      const destino: DestinoEnvio = { departamento: 'Valle' };

      expect(elegirTarifa([ancha, angosta], destino, 5000)?.id).toBe('angosta');

      const primera = tarifa({
        id: 'primera',
        departamentoNombre: 'Valle',
        ciudadNombre: null,
        pesoMinG: 0,
        pesoMaxG: 10_000,
        creado: new Date('2026-01-01'),
      });
      const segunda = tarifa({
        id: 'segunda',
        departamentoNombre: 'Valle',
        ciudadNombre: null,
        pesoMinG: 0,
        pesoMaxG: 10_000,
        creado: new Date('2026-01-02'),
      });

      expect(elegirTarifa([segunda, primera], destino, 5000)?.id).toBe('primera');
    });
  });

  describe('CAT10 — cotización con cobertura', () => {
    it('CAT10 — Cotización con cobertura devuelve el rango y los días ya formateados de la tarifa elegida', () => {
      const elegida = tarifa({
        id: 'elegida',
        rangoMinCop: 30000,
        rangoMaxCop: 40000,
        diasMin: 2,
        diasMax: 4,
        contraentregaDisponible: true,
      });

      const resultado = armarCotizacionConCobertura(elegida);

      expect(resultado).toEqual({
        cobertura: true,
        rangoTexto: formatearRangoCop(30000, 40000),
        diasTexto: formatearDias(2, 4),
        contraentregaDisponible: true,
      });
    });
  });
});
