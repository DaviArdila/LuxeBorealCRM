export type FaseCircuito = 'cerrado' | 'abierto' | 'semiabierto';

export interface EstadoCircuito {
  readonly fase: FaseCircuito;
  readonly fallosConsecutivos: number;
  readonly abiertoDesde: Date | null;
}

export interface ConfigCircuito {
  readonly umbralFallos: number;
  readonly ventanaMs: number;
}

export interface DecisionCircuito {
  readonly llamar: boolean;
  readonly estado: EstadoCircuito;
}

export const CIRCUITO_INICIAL: EstadoCircuito = {
  fase: 'cerrado',
  fallosConsecutivos: 0,
  abiertoDesde: null,
};

// Pasada la ventana entra en `semiabierto` y deja una sola sonda: mientras esa sonda no reporte,
// el resto de las llamadas se bloquea (D5, ADR-0013).
export function debeLlamar(
  estado: EstadoCircuito,
  ahora: Date,
  config: ConfigCircuito,
): DecisionCircuito {
  if (estado.fase === 'cerrado') {
    return { llamar: true, estado };
  }
  if (estado.fase === 'semiabierto') {
    return { llamar: false, estado };
  }
  const abiertoDesde = estado.abiertoDesde;
  if (abiertoDesde !== null && ahora.getTime() - abiertoDesde.getTime() >= config.ventanaMs) {
    return { llamar: true, estado: { ...estado, fase: 'semiabierto' } };
  }
  return { llamar: false, estado };
}

export function registrarExito(): EstadoCircuito {
  return CIRCUITO_INICIAL;
}

export function registrarFallo(
  estado: EstadoCircuito,
  ahora: Date,
  config: ConfigCircuito,
): EstadoCircuito {
  if (estado.fase === 'semiabierto') {
    return { fase: 'abierto', fallosConsecutivos: estado.fallosConsecutivos, abiertoDesde: ahora };
  }
  if (estado.fase === 'abierto') {
    return estado;
  }
  const fallosConsecutivos = estado.fallosConsecutivos + 1;
  if (fallosConsecutivos >= config.umbralFallos) {
    return { fase: 'abierto', fallosConsecutivos, abiertoDesde: ahora };
  }
  return { ...estado, fallosConsecutivos };
}
