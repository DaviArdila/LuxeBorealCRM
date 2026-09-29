import {
  CIRCUITO_INICIAL,
  debeLlamar,
  registrarExito,
  registrarFallo,
  type ConfigCircuito,
  type EstadoCircuito,
} from './estado-circuito.js';

// D5 de `openspec/changes/fase-06-pasarela-llm/design.md` y ADR-0013: umbral 5, ventana 60 s, una
// sonda semiabierta, transiciones puras sobre `(estado, ahora)`.

const CONFIG: ConfigCircuito = { umbralFallos: 5, ventanaMs: 60_000 };
const T0 = new Date('2026-09-28T12:00:00.000Z');

function conFallos(cantidad: number, ahora: Date = T0): EstadoCircuito {
  let estado = CIRCUITO_INICIAL;
  for (let i = 0; i < cantidad; i += 1) {
    estado = registrarFallo(estado, ahora, CONFIG);
  }
  return estado;
}

describe('modulos/llm/dominio — máquina del circuit breaker (D5, ADR-0013)', () => {
  it('un circuito cerrado deja llamar sin cambiar de estado', () => {
    const decision = debeLlamar(CIRCUITO_INICIAL, T0, CONFIG);

    expect(decision.llamar).toBe(true);
    expect(decision.estado).toEqual(CIRCUITO_INICIAL);
  });

  it('cuatro fallos consecutivos siguen cerrados y el quinto abre el circuito', () => {
    expect(conFallos(4).fase).toBe('cerrado');
    expect(conFallos(4).fallosConsecutivos).toBe(4);

    const abierto = conFallos(5);

    expect(abierto.fase).toBe('abierto');
    expect(abierto.abiertoDesde).toEqual(T0);
  });

  it('un éxito reinicia la cuenta de fallos consecutivos', () => {
    expect(conFallos(4).fallosConsecutivos).toBe(4);

    const tras = registrarFallo(registrarExito(), T0, CONFIG);

    expect(tras.fase).toBe('cerrado');
    expect(tras.fallosConsecutivos).toBe(1);
  });

  it('abierto dentro de la ventana no deja llamar', () => {
    const decision = debeLlamar(conFallos(5), new Date(T0.getTime() + 59_999), CONFIG);

    expect(decision.llamar).toBe(false);
    expect(decision.estado.fase).toBe('abierto');
  });

  it('pasada la ventana deja una sola llamada de prueba y bloquea la siguiente', () => {
    const pasada = new Date(T0.getTime() + 60_000);

    const sonda = debeLlamar(conFallos(5), pasada, CONFIG);
    const segunda = debeLlamar(sonda.estado, pasada, CONFIG);

    expect(sonda.llamar).toBe(true);
    expect(sonda.estado.fase).toBe('semiabierto');
    expect(segunda.llamar).toBe(false);
    expect(segunda.estado.fase).toBe('semiabierto');
  });

  it('una sonda exitosa cierra el circuito', () => {
    const sonda = debeLlamar(conFallos(5), new Date(T0.getTime() + 60_000), CONFIG);

    expect(sonda.estado.fase).toBe('semiabierto');
    expect(registrarExito()).toEqual(CIRCUITO_INICIAL);
  });

  it('una sonda fallida reabre el circuito otros 60 segundos desde ese instante', () => {
    const instanteSonda = new Date(T0.getTime() + 60_000);
    const sonda = debeLlamar(conFallos(5), instanteSonda, CONFIG);

    const reabierto = registrarFallo(sonda.estado, instanteSonda, CONFIG);
    const dentro = debeLlamar(reabierto, new Date(instanteSonda.getTime() + 59_999), CONFIG);
    const fuera = debeLlamar(reabierto, new Date(instanteSonda.getTime() + 60_000), CONFIG);

    expect(reabierto.fase).toBe('abierto');
    expect(reabierto.abiertoDesde).toEqual(instanteSonda);
    expect(dentro.llamar).toBe(false);
    expect(fuera.llamar).toBe(true);
  });
});
