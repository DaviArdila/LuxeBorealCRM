/**
 * Dominio puro del horario de atención (HOR1-HOR6, design.md D5). Portado de
 * `../ChatLuxeCRM/src/horario/dentroHorario.ts`: resuelve el momento local en zona horaria de
 * Bogotá, evalúa un rango (incluido el que cruza medianoche) y decide dentro/fuera combinando la
 * excepción del día, el patrón semanal y la forma del valor guardado. No importa nada fuera de sí
 * mismo (regla `dominio-aislado`): recibe siempre `fecha`/`momento` como parámetro, nunca llama a
 * `Date.now()`/`new Date()` ni lee el `Clock` inyectado — eso lo hace la aplicación en T9.
 */

export const ZONA_HORARIA = 'America/Bogota';

const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
type Dia = (typeof DIAS)[number];

const DIA_DESDE_INTL: Record<string, Dia> = {
  Mon: 'lun',
  Tue: 'mar',
  Wed: 'mie',
  Thu: 'jue',
  Fri: 'vie',
  Sat: 'sab',
  Sun: 'dom',
};

export interface MomentoLocal {
  readonly dia: string;
  readonly minutos: number;
  readonly fechaIso: string;
}

/** Fecha/hora en Colombia sin librerías de fecha: `Intl` con `timeZone` fija (D5). */
export function momentoLocal(fecha: Date): MomentoLocal {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(fecha);
  const valorDe = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  const hora = Number(valorDe('hour')) % 24;

  return {
    dia: DIA_DESDE_INTL[valorDe('weekday')] ?? 'lun',
    minutos: hora * 60 + Number(valorDe('minute')),
    fechaIso: `${valorDe('year')}-${valorDe('month')}-${valorDe('day')}`,
  };
}

function aMinutos(hhmm: string): number | null {
  const coincidencia = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!coincidencia) return null;
  return Number(coincidencia[1]) * 60 + Number(coincidencia[2]);
}

/** "08:00-18:00" o "20:00-02:00" (cruza medianoche: tramo inicio→medianoche + medianoche→fin). */
export function dentroDeRango(rango: string, minutos: number): boolean {
  const [inicioTexto, finTexto] = rango.split('-');
  const inicio = inicioTexto ? aMinutos(inicioTexto) : null;
  const fin = finTexto ? aMinutos(finTexto) : null;
  if (inicio == null || fin == null) return false;
  if (inicio <= fin) return minutos >= inicio && minutos < fin;
  return minutos >= inicio || minutos < fin;
}

function normalizarClaveDia(clave: string): string {
  return clave
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** `valorCrudo` ya deserializado por Prisma (`jsonb`, D5): forma válida = objeto plano, no arreglo. */
function esFormaValida(valorCrudo: unknown): valorCrudo is Record<string, unknown> {
  return typeof valorCrudo === 'object' && valorCrudo !== null && !Array.isArray(valorCrudo);
}

/** Resuelve el rango del día: clave exacta ("sab") gana sobre un rango ("lun-vie"). */
function rangoDelDia(patron: Record<string, unknown>, dia: Dia): string | null | undefined {
  const entradas = Object.entries(patron).map(([clave, valor]) => [normalizarClaveDia(clave), valor] as const);

  const exacta = entradas.find(([clave]) => clave === dia);
  if (exacta) return exacta[1] as string | null;

  for (const [clave, valor] of entradas) {
    const [inicioClave, finClave] = clave.split('-');
    if (!inicioClave || !finClave) continue;
    const inicio = DIAS.indexOf(inicioClave as Dia);
    const fin = DIAS.indexOf(finClave as Dia);
    if (inicio === -1 || fin === -1) continue;
    const indiceDia = DIAS.indexOf(dia);
    const dentroDelRangoDeDias = inicio <= fin ? indiceDia >= inicio && indiceDia <= fin : indiceDia >= inicio || indiceDia <= fin;
    if (dentroDelRangoDeDias) return valor as string | null;
  }

  return undefined;
}

export interface ResultadoHorario {
  readonly dentro: boolean;
  readonly advertencia?: string;
}

/**
 * HOR1 (excepción gana sobre el patrón), HOR2 (sin parámetro ⇒ dentro), HOR3 (forma inválida de
 * `valorCrudo` ⇒ dentro + advertencia, nunca lanza), HOR4 (día fuera del patrón ⇒ dentro), HOR5
 * (entrada `null`/vacía para el día ⇒ fuera); en cualquier otro caso evalúa `dentroDeRango` (HOR6).
 */
export function decidirDentroDeHorario(momento: MomentoLocal, existeExcepcion: boolean, valorCrudo: unknown): ResultadoHorario {
  if (existeExcepcion) return { dentro: false };

  if (valorCrudo === null || valorCrudo === undefined) return { dentro: true };

  if (!esFormaValida(valorCrudo)) {
    return {
      dentro: true,
      advertencia: 'parametro.horario_atencion no tiene una forma válida (se esperaba un objeto); se asume dentro de horario',
    };
  }

  const rango = rangoDelDia(valorCrudo, momento.dia as Dia);
  if (rango === undefined) return { dentro: true };
  if (rango === null || rango === '') return { dentro: false };
  return { dentro: dentroDeRango(String(rango), momento.minutos) };
}
