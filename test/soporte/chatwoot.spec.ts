import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cargarFixtureChatwoot, DIRECTORIO_FIXTURES_CHATWOOT, firmarComoChatwoot } from './chatwoot.js';

/**
 * Unitario de T1 (`openspec/changes/fase-04-canal-chatwoot/tasks.md`): el arnés de fixtures reales
 * de Chatwoot y la firma de prueba. Nada de esto es código de producción (D3 de `design.md`): solo
 * lo usan tests y el script de captura.
 */
describe('chatwoot (soporte, T1, unitario)', () => {
  describe('cargarFixtureChatwoot', () => {
    it('lanza para un fixture inexistente', () => {
      expect(() => cargarFixtureChatwoot('no-existe.json')).toThrow(/no encontrado/);
    });

    it('carga el fixture de mensaje entrante de texto con su forma real', () => {
      const fixture = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');

      expect(fixture.rawBody).toBeInstanceOf(Buffer);
      const json = fixture.json as { event: string; message_type: string; private: boolean };
      expect(json.event).toBe('message_created');
      expect(json.message_type).toBe('incoming');
      expect(json.private).toBe(false);
    });

    it('carga el fixture de cambio de estado a resolved con status en la raíz', () => {
      const fixture = cargarFixtureChatwoot('conversacion-estado-resolved.json');

      const json = fixture.json as { event: string; status: string; id: number };
      expect(json.event).toBe('conversation_status_changed');
      expect(json.status).toBe('resolved');
      expect(typeof json.id).toBe('number');
    });

    it('el JSON parseado es equivalente al `rawBody` (mismo body que se firma)', () => {
      const fixture = cargarFixtureChatwoot('mensaje-creado-saliente-bot.json');

      expect(JSON.parse(fixture.rawBody.toString('utf8'))).toEqual(fixture.json);
    });
  });

  describe('firmarComoChatwoot', () => {
    it('produce el formato sha256=<hex> esperado por verificarFirmaChatwoot', () => {
      const rawBody = Buffer.from('{"event":"message_created"}', 'utf8');

      const firma = firmarComoChatwoot(rawBody, 1_700_000_000, 'secreto-de-prueba');

      expect(firma).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it('coincide con un HMAC-SHA256("<ts>.<body>") calculado de forma independiente', () => {
      const rawBody = Buffer.from('{"event":"conversation_status_changed"}', 'utf8');
      const ts = 1_700_000_123;
      const secreto = 'otro-secreto';

      const firma = firmarComoChatwoot(rawBody, ts, secreto);

      const esperada = `sha256=${createHmac('sha256', secreto).update(`${ts}.`).update(rawBody).digest('hex')}`;
      expect(firma).toBe(esperada);
    });

    it('cambia si el rawBody cambia (sensible al cuerpo exacto, no a un JSON re-serializado)', () => {
      const ts = 1_700_000_000;
      const secreto = 'secreto-de-prueba';

      const firmaA = firmarComoChatwoot(Buffer.from('{"a":1}', 'utf8'), ts, secreto);
      const firmaB = firmarComoChatwoot(Buffer.from('{"a": 1}', 'utf8'), ts, secreto);

      expect(firmaA).not.toBe(firmaB);
    });
  });

  describe('anonimización (matriz de amenazas: PII en logs/base, R14)', () => {
    it('ningún fixture contiene el teléfono real capturado ni el nombre real del contacto de prueba', () => {
      const archivos = readdirSync(DIRECTORIO_FIXTURES_CHATWOOT).filter((archivo) => archivo.endsWith('.json'));
      expect(archivos.length).toBeGreaterThan(0);

      for (const archivo of archivos) {
        const contenido = readFileSync(join(DIRECTORIO_FIXTURES_CHATWOOT, archivo), 'utf8');
        expect(contenido).not.toContain('573009998877');
        expect(contenido).not.toContain('Cliente Prueba Fixture');
        expect(contenido).not.toContain('luxeboreal.com');
      }
    });
  });
});
