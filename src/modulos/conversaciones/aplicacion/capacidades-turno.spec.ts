import { capacidadesTurno } from './capacidades-turno.js';

describe('modulos/conversaciones/aplicacion — capacidadesTurno', () => {
  it('WhatsApp: el mensaje saliente cuesta y se admite imagen', () => {
    expect(capacidadesTurno('whatsapp')).toEqual({ mensajeSalienteCuesta: true, admiteImagen: true });
  });

  it.each(['instagram', 'messenger', 'web', 'otro'] as const)(
    'canal %s sin perfil soportado: capacidades conservadoras',
    (canal) => {
      expect(capacidadesTurno(canal)).toEqual({ mensajeSalienteCuesta: true, admiteImagen: true });
    },
  );
});
