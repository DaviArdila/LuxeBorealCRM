import { perfilDeCapacidades } from './perfil-capacidades.js';

// CAN8 — títulos tomados literalmente de
// openspec/changes/fase-04-canal-chatwoot/specs/canales/spec.md.

describe('canales/dominio/perfil-capacidades', () => {
  describe('CAN8 — Perfil de capacidades por canal', () => {
    it('CAN8 — El canal WhatsApp devuelve su perfil de capacidades real', () => {
      const perfil = perfilDeCapacidades('whatsapp');

      expect(perfil).toEqual({
        soportado: true,
        canal: 'whatsapp',
        ventanaRespuestaHoras: 24,
        mensajeSalienteTieneCosto: true,
        traeTelefono: true,
        indicadorEscribiendo: 'meta-directo',
        adjuntosEntrantes: ['imagen', 'audio', 'ubicacion', 'documento'],
        limitesInteractivos: { textoBoton: 24, descripcionFila: 72 },
      });
    });

    it('CAN8 — Un canal distinto de WhatsApp devuelve un perfil explícito de no soportado', () => {
      for (const canal of ['instagram', 'messenger', 'web', 'otro'] as const) {
        expect(perfilDeCapacidades(canal)).toEqual({
          soportado: false,
          canal,
          motivo: 'canal-no-soportado',
        });
      }
    });

    it('nunca devuelve un valor "por verificar" inventado para un canal no soportado', () => {
      const perfil = perfilDeCapacidades('instagram');

      expect(perfil).not.toHaveProperty('ventanaRespuestaHoras');
      expect(perfil).toEqual({ soportado: false, canal: 'instagram', motivo: 'canal-no-soportado' });
    });
  });
});
