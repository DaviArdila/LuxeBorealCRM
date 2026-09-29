import type { TipoContenidoTurno } from '../../conversaciones/index.js';
import { decidirAudio, decidirNoTextuales } from './decidir-no-textuales.js';

describe('decidirNoTextuales (tabla de D6)', () => {
  it.each<[string, TipoContenidoTurno[], ReturnType<typeof decidirNoTextuales>]>([
    ['solo texto', ['texto'], { accion: 'seguir', reiniciaAudios: true }],
    ['texto y audio en la misma ráfaga', ['texto', 'audio'], { accion: 'seguir', reiniciaAudios: true }],
    ['audio antes de un texto', ['audio', 'imagen', 'texto'], { accion: 'seguir', reiniciaAudios: true }],
    ['último mensaje audio', ['imagen', 'audio'], { accion: 'audio' }],
    ['último mensaje imagen', ['audio', 'imagen'], { accion: 'imagen' }],
    ['último mensaje ubicación', ['ubicacion'], { accion: 'seguir', reiniciaAudios: false }],
    ['sticker', ['sticker'], { accion: 'ignorar' }],
    ['documento', ['audio', 'documento'], { accion: 'ignorar' }],
    ['otro', ['otro'], { accion: 'ignorar' }],
    ['ráfaga vacía', [], { accion: 'ignorar' }],
  ])('%s', (_nombre, tipos, esperado) => {
    expect(decidirNoTextuales(tipos)).toEqual(esperado);
  });
});

describe('decidirAudio', () => {
  it('el primer audio de la sesión pide texto y el segundo deriva', () => {
    expect(decidirAudio(1)).toBe('pedir-texto');
    expect(decidirAudio(2)).toBe('derivar');
    expect(decidirAudio(5)).toBe('derivar');
  });
});
