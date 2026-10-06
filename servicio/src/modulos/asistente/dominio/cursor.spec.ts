import { describe, expect, it } from 'vitest';
import { codificarCursor, decodificarCursor } from './cursor.js';

// API5 / CAS10: el cursor es opaco y solo lo entiende el servidor.

describe('cursor de casos (API5, CAS10)', () => {
  it('lo que se codifica se decodifica igual', () => {
    const posicion = { ordenCategoria: 2, tituloNormalizado: 'garantia', id: '0199a000-0000-7000-8000-000000000001' };

    expect(decodificarCursor(codificarCursor(posicion))).toEqual(posicion);
  });

  it('es opaco: no deja ver el título en claro', () => {
    expect(codificarCursor({ ordenCategoria: 0, tituloNormalizado: 'garantia', id: 'x' })).not.toContain('garantia');
  });

  it.each(['', 'no-es-un-cursor', Buffer.from('{"a":1}').toString('base64url'), Buffer.from('["x",1,2]').toString('base64url'), Buffer.from('[1,"a"]').toString('base64url')])(
    'un cursor inválido («%s») se rechaza con null',
    (cursor) => {
      expect(decodificarCursor(cursor)).toBeNull();
    },
  );
});
