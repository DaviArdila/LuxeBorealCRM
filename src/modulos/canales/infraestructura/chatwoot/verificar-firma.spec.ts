import { cargarFixtureChatwoot, firmarComoChatwoot } from '../../../../../test/soporte/chatwoot.js';
import { verificarFirmaChatwoot } from './verificar-firma.js';

// R3/CAN2 — títulos tomados literalmente de openspec/specs/canales/spec.md y de
// openspec/changes/fase-04-canal-chatwoot/specs/canales/spec.md. El resto de casos de esta tabla
// (design.md, "Testing Strategy") no tiene título propio de escenario.

const SECRETO = 'secreto-de-prueba';
const TOLERANCIA_S = 300;
const AHORA_S = 1_790_475_262;

function firmarFixture(nombreArchivo: string, timestampSegundos = AHORA_S, secreto = SECRETO) {
  const { rawBody } = cargarFixtureChatwoot(nombreArchivo);
  return { rawBody, firmaHeader: firmarComoChatwoot(rawBody, timestampSegundos, secreto) };
}

describe('canales/infraestructura/chatwoot/verificar-firma', () => {
  describe('D3 — verificación de firma HMAC sobre el body crudo', () => {
    it('acepta una firma válida calculada sobre un fixture real, firma idéntica ordenada o no', () => {
      const { rawBody, firmaHeader } = firmarFixture('mensaje-creado-entrante-texto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader,
          timestampHeader: String(AHORA_S),
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(true);
    });

    it('CAN2 — Una petición sin cabecera de firma se rechaza sin registrar nada', () => {
      const { rawBody } = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader: undefined,
          timestampHeader: String(AHORA_S),
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(false);
    });

    it('R3 — Evento con firma inválida', () => {
      const { rawBody } = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader: 'sha256=' + '0'.repeat(64),
          timestampHeader: String(AHORA_S),
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(false);
    });

    it('rechaza sin cabecera de timestamp', () => {
      const { rawBody, firmaHeader } = firmarFixture('mensaje-creado-entrante-texto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader,
          timestampHeader: undefined,
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(false);
    });

    it('rechaza un prefijo distinto de sha256=', () => {
      const { rawBody, firmaHeader } = firmarFixture('mensaje-creado-entrante-texto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader: firmaHeader.replace('sha256=', 'sha1='),
          timestampHeader: String(AHORA_S),
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(false);
    });

    it('rechaza un timestamp fuera de la tolerancia (anti-replay)', () => {
      const { rawBody, firmaHeader } = firmarFixture('mensaje-creado-entrante-texto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader,
          timestampHeader: String(AHORA_S),
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S + TOLERANCIA_S + 1,
        }),
      ).toBe(false);
    });

    it('rechaza un timestamp no numérico', () => {
      const { rawBody, firmaHeader } = firmarFixture('mensaje-creado-entrante-texto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader,
          timestampHeader: 'no-numerico',
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(false);
    });

    it('secreto vacío falla cerrado: rechaza incluso una firma calculada con el mismo secreto vacío', () => {
      const { rawBody, firmaHeader } = firmarFixture('mensaje-creado-entrante-texto.json', AHORA_S, '');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader,
          timestampHeader: String(AHORA_S),
          secreto: '',
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(false);
    });

    it('rechaza una firma de longitud distinta a la esperada', () => {
      const { rawBody } = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody,
          firmaHeader: 'sha256=ab',
          timestampHeader: String(AHORA_S),
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(false);
    });

    it('rechaza la firma calculada sobre otro fixture (el body crudo importa, no solo el timestamp)', () => {
      const { firmaHeader } = firmarFixture('mensaje-creado-entrante-texto.json');
      const { rawBody: otroRawBody } = cargarFixtureChatwoot('mensaje-creado-entrante-adjunto.json');

      expect(
        verificarFirmaChatwoot({
          rawBody: otroRawBody,
          firmaHeader,
          timestampHeader: String(AHORA_S),
          secreto: SECRETO,
          toleranciaSegundos: TOLERANCIA_S,
          ahoraSegundos: AHORA_S,
        }),
      ).toBe(false);
    });
  });
});
