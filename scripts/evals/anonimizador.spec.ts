import {
  anonimizar,
  casoDesdeChatwoot,
  ErrorDatoPersonalResidual,
  TablaMarcadores,
  verificarSinDatosPersonales,
} from './anonimizador.js';

// Escenarios EVL5 de `openspec/changes/fase-07c-evals/specs/agente/spec.md` (R14).

describe('scripts/evals — anonimizador (D8)', () => {
  it('EVL5 — Teléfonos, correos y cédulas se reemplazan por marcadores estables', () => {
    const tabla = new TablaMarcadores();
    const texto =
      'Mi cel es 3001234567, escríbeme a laura.gomez@correo.com o llámame al +57 300 123 4567. ' +
      'Mi cédula es 1.023.456.789.';

    const resultado = anonimizar(texto, [], tabla);

    expect(resultado).toBe(
      'Mi cel es <TELEFONO_1>, escríbeme a <CORREO_1> o llámame al <TELEFONO_1>. Mi cédula es <CEDULA_1>.',
    );
    expect(() => verificarSinDatosPersonales(resultado)).not.toThrow();
  });

  it('el mismo dato repetido en textos distintos usa el mismo marcador; uno nuevo, el siguiente número', () => {
    const tabla = new TablaMarcadores();

    expect(anonimizar('llama al 3001234567', [], tabla)).toBe('llama al <TELEFONO_1>');
    expect(anonimizar('o al 3109876543 o al 300 123 4567', [], tabla)).toBe('o al <TELEFONO_2> o al <TELEFONO_1>');
  });

  it('reemplaza nombres propios por palabra completa, sin distinguir mayúsculas ni tildes', () => {
    const tabla = new TablaMarcadores();

    const resultado = anonimizar('Soy Laura Gómez. Mi hermana Lauren no.', ['Laura Gómez', 'laura'], tabla);

    expect(resultado).toBe('Soy <NOMBRE_1>. Mi hermana Lauren no.');
  });

  it('reemplaza direcciones colombianas con nomenclatura', () => {
    const tabla = new TablaMarcadores();

    const resultado = anonimizar('Vivo en la Calle 45 # 12-34 apto 301 y antes en Cra 7 No. 1-1.', [], tabla);

    expect(resultado).toBe('Vivo en la <DIRECCION_1> apto 301 y antes en <DIRECCION_2>.');
  });

  it('EVL5 — Un dato personal que sobrevive hace fallar el anonimizador', () => {
    const tabla = new TablaMarcadores();
    // Dígitos sueltos: el reemplazo no los reconoce como teléfono, la verificación final sí.
    const resultado = anonimizar('mi número es 3 0 0 1 2 3 4 5 6 7', [], tabla);

    expect(() => verificarSinDatosPersonales(resultado)).toThrow(ErrorDatoPersonalResidual);
  });

  it('la verificación también rechaza cualquier arroba', () => {
    expect(() => verificarSinDatosPersonales('escríbeme a alguien@')).toThrow(ErrorDatoPersonalResidual);
  });

  it('el error no copia el dato que sobrevivió', () => {
    try {
      verificarSinDatosPersonales('mi número es 3 0 0 1 2 3 4 5 6 7');
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('3 0 0 1');
    }
  });
});

describe('scripts/evals — casoDesdeChatwoot', () => {
  const mensajes = {
    meta: { contact: { name: 'Laura Gómez' } },
    payload: [
      { id: 1, message_type: 0, content: 'Hola, soy Laura Gómez, mi cel 3001234567', sender: { name: 'Laura Gómez' } },
      { id: 2, message_type: 1, content: 'Hola Laura, ¿en qué te ayudo?', sender: { name: 'Bot' } },
      { id: 3, message_type: 0, content: 'Busco un anillo', sender: { name: 'Laura Gómez' } },
      { id: 4, message_type: 2, content: 'Mensaje de actividad', sender: null },
    ],
  };

  it('convierte cada mensaje entrante en un turno anonimizado y descarta lo demás', () => {
    const caso = casoDesdeChatwoot(mensajes, { id: 'conv-1', nombres: [] });

    expect(caso.turnos.map((turno) => turno.mensajes[0]?.texto)).toEqual([
      'Hola, soy <NOMBRE_1>, mi cel <TELEFONO_1>',
      'Busco un anillo',
    ]);
    expect(caso).toMatchObject({ id: 'conv-1', origen: 'real-anonimizado', revisadoPor: '', fecha: '' });
    expect(caso.turnos[0]?.aserciones).toEqual({});
  });

  it('el nombre del contacto de Chatwoot se anonimiza aunque no se pase en --nombres', () => {
    const caso = casoDesdeChatwoot(mensajes, { id: 'conv-1', nombres: [] });

    expect(JSON.stringify(caso)).not.toContain('Gómez');
  });

  it('falla sin devolver el caso si queda un dato personal', () => {
    const conResiduo = { payload: [{ id: 1, message_type: 0, content: 'mi número 3 0 0 1 2 3 4 5 6 7' }] };

    expect(() => casoDesdeChatwoot(conResiduo, { id: 'x', nombres: [] })).toThrow(ErrorDatoPersonalResidual);
  });
});
