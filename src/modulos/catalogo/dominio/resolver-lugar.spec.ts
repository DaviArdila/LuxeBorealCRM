import { resolverLugar, type CatalogoLugares } from './resolver-lugar.js';

function catalogo(): CatalogoLugares {
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

describe('catalogo/dominio/resolver-lugar', () => {
  describe('IMP9 — resolución de departamento y ciudad a código DANE', () => {
    it('IMP9 — Un departamento y ciudad de la hoja se resuelven a su código DANE', () => {
      const resultado = resolverLugar(catalogo(), 'antioquia', 'Medellín');

      expect(resultado).toEqual({ departamentoId: '05', ciudadId: '05001' });
    });

    it('IMP9 — Un departamento sin match en geografia es una fila inválida que cita el texto exacto', () => {
      const resultado = resolverLugar(catalogo(), 'Antioqia', null);

      expect(resultado).toBeNull();
    });

    it('IMP9 — Una fila de cobertura con departamento y sin ciudad excluye todo el departamento', () => {
      const resultado = resolverLugar(catalogo(), 'Chocó', null);

      expect(resultado).toEqual({ departamentoId: '27', ciudadId: null });
    });
  });
});
