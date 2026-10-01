import { describe, expect, it } from 'vitest';
import { construirEnlaceConversacion } from './enlace-conversacion.js';

const BASE = {
  urlPublica: 'https://chat.ejemplo.co',
  urlChatwoot: 'http://localhost:3001',
  cuenta: 1,
  idChatwoot: 2,
};

describe('construirEnlaceConversacion', () => {
  it('NTF5 — arma el enlace con la URL pública, la cuenta y el id de la conversación', () => {
    expect(construirEnlaceConversacion(BASE)).toBe('https://chat.ejemplo.co/app/accounts/1/conversations/2');
  });

  it('NTF5 — sin URL pública usa la de Chatwoot', () => {
    const enlace = construirEnlaceConversacion({ ...BASE, urlPublica: undefined });

    expect(enlace).toBe('http://localhost:3001/app/accounts/1/conversations/2');
  });

  it('NTF5 — una URL pública vacía cae en la de Chatwoot', () => {
    expect(construirEnlaceConversacion({ ...BASE, urlPublica: '  ' })).toMatch(/^http:\/\/localhost:3001\/app\//);
  });

  it('NTF5 — una barra final en la URL base no duplica la barra', () => {
    const enlace = construirEnlaceConversacion({ ...BASE, urlPublica: 'https://chat.ejemplo.co//' });

    expect(enlace).toBe('https://chat.ejemplo.co/app/accounts/1/conversations/2');
    expect(enlace).not.toContain('//app');
  });

  it('NTF5 — sin identificador de Chatwoot no hay enlace', () => {
    expect(construirEnlaceConversacion({ ...BASE, idChatwoot: null })).toBeNull();
    expect(construirEnlaceConversacion({ ...BASE, idChatwoot: undefined })).toBeNull();
  });

  it('NTF5 — el enlace contiene solo ids numéricos, nunca datos del cliente', () => {
    const enlace = construirEnlaceConversacion({ ...BASE, cuenta: 7, idChatwoot: 123 });

    expect(enlace).toBe('https://chat.ejemplo.co/app/accounts/7/conversations/123');
  });
});
