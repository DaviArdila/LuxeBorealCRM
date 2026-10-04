import type { MensajeTurno } from '../../conversaciones/index.js';
import { MARCADOR_UBICACION, textoDelCliente } from './texto-del-cliente.js';

function mensaje(tipoContenido: MensajeTurno['tipoContenido'], texto = ''): MensajeTurno {
  return { idMensaje: `m-${tipoContenido}-${texto}`, tipoContenido, texto };
}

describe('modulos/agente/dominio — textoDelCliente', () => {
  it('une con espacios los textos de la ráfaga', () => {
    expect(textoDelCliente([mensaje('texto', 'hola'), mensaje('texto', 'quiero el SKU-1')])).toBe(
      'hola quiero el SKU-1',
    );
  });

  it('R12 — Ubicación entrante: sin texto viaja como el marcador de ubicación compartida', () => {
    expect(textoDelCliente([mensaje('ubicacion')])).toBe(MARCADOR_UBICACION);
    expect(MARCADOR_UBICACION).toBe('[ubicación compartida]');
  });

  it('con texto y ubicación en la misma ráfaga manda solo el texto', () => {
    expect(textoDelCliente([mensaje('ubicacion'), mensaje('texto', 'estoy en Cali')])).toBe('estoy en Cali');
  });

  it('una ráfaga sin texto ni ubicación queda vacía', () => {
    expect(textoDelCliente([mensaje('sticker')])).toBe('');
  });
});
