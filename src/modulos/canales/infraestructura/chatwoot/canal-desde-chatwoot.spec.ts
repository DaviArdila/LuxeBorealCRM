import { canalDesdeChatwoot } from './canal-desde-chatwoot.js';

describe('canales/infraestructura/chatwoot/canal-desde-chatwoot', () => {
  describe('D14 — mapeo de conversation.channel a CanalOrigen', () => {
    it.each([
      ['Channel::Whatsapp', 'whatsapp'],
      ['Channel::Instagram', 'instagram'],
      ['Channel::FacebookPage', 'messenger'],
      ['Channel::WebWidget', 'web'],
      // Channel::Api es el inbox de pruebas local (fixtures de T1): no tiene mapeo propio.
      ['Channel::Api', 'otro'],
      ['Channel::Desconocido', 'otro'],
      [null, 'otro'],
      [undefined, 'otro'],
    ] as const)('%s -> %s', (channel, esperado) => {
      expect(canalDesdeChatwoot(channel)).toBe(esperado);
    });
  });
});
