import {
  MAX_PASOS_SECUENCIA,
  claveEstado,
  claveEtiquetas,
  claveMensaje,
  grupoConversacion,
} from './claves-idempotencia.js';

describe('canales/dominio/claves-idempotencia', () => {
  describe('D11 — formato de la clave de idempotencia', () => {
    it('grupoConversacion antepone el prefijo canal: al id de conversación', () => {
      expect(grupoConversacion('4711')).toBe('canal:4711');
    });

    it('claveMensaje construye canal:mensaje:<conversacion>:<respuesta>:<paso de dos dígitos>', () => {
      expect(claveMensaje('4711', 'turno-9', 0)).toBe('canal:mensaje:4711:turno-9:00');
      expect(claveMensaje('4711', 'turno-9', 5)).toBe('canal:mensaje:4711:turno-9:05');
      expect(claveMensaje('4711', 'turno-9', MAX_PASOS_SECUENCIA - 1)).toBe('canal:mensaje:4711:turno-9:19');
    });

    it('claveMensaje rechaza un paso fuera de 0..MAX_PASOS_SECUENCIA-1', () => {
      expect(() => claveMensaje('4711', 'turno-9', -1)).toThrow();
      expect(() => claveMensaje('4711', 'turno-9', MAX_PASOS_SECUENCIA)).toThrow();
      expect(() => claveMensaje('4711', 'turno-9', 1.5)).toThrow();
    });

    it('claveEstado construye canal:estado:<conversacion>:<operacion>', () => {
      expect(claveEstado('4711', 'op-1')).toBe('canal:estado:4711:op-1');
    });

    it('claveEtiquetas construye canal:etiquetas:<conversacion>:<operacion>', () => {
      expect(claveEtiquetas('4711', 'op-1')).toBe('canal:etiquetas:4711:op-1');
    });

    it('rechaza un id con ":" para que la clave nunca sea ambigua', () => {
      expect(() => claveEstado('4711:x', 'op-1')).toThrow();
      expect(() => claveEtiquetas('4711', 'op:1')).toThrow();
      expect(() => grupoConversacion('4711:x')).toThrow();
    });

    it('rechaza un id vacío o más largo de 64 caracteres', () => {
      expect(() => claveEstado('', 'op-1')).toThrow();
      expect(() => claveEstado('4711', 'a'.repeat(65))).toThrow();
    });

    it('MAX_PASOS_SECUENCIA es 20 (D11)', () => {
      expect(MAX_PASOS_SECUENCIA).toBe(20);
    });
  });
});
