/** Motivos de traspaso sin lead que avisan al asesor (NTF6): el complemento de los motivos que nacen de un lead. */
export type MotivoTraspaso =
  | 'tope-turnos'
  | 'fallo-llm'
  | 'techo-gasto'
  | 'audio-repetido'
  | 'argumentos-invalidos'
  | 'plazo-agotado';

/**
 * Motivos que avisan al asesor sin traspasar (NTF8, Fase 12d): el cliente pide una persona (`pide-persona`, de la
 * política) o el modelo lo pide con `derivar_a_asesor` (`pide-asesor`), o insiste con audios. `lead-caliente` sigue el
 * camino de leads (NTF2).
 */
export type MotivoAvisoSinTraspaso = 'pide-persona' | 'pide-asesor' | 'audio-repetido';

/** Lo que un aviso al asesor sabe de un lead (D9 de la Fase 08): nunca datos de contacto (R14). */
export interface DatosAvisoLead {
  readonly tipo: 'lead' | 'recordatorio';
  readonly temperatura: string;
  readonly senales: readonly string[];
  readonly resumen: string;
  readonly capturadoFueraHorario: boolean;
  /** Nombre del producto de interés (nunca su SKU, AGT16). */
  readonly producto?: string;
  readonly enlace?: string;
}

/** Un traspaso a una persona que no nació de un lead (NTF6): solo se sabe el motivo. */
export interface DatosAvisoTraspaso {
  readonly tipo: 'traspaso';
  readonly motivo: MotivoTraspaso;
  readonly enlace?: string;
}

/** El bot sigue atendiendo y avisa a un asesor (NTF8): solo se sabe el motivo, que nunca es texto del modelo. */
export interface DatosAvisoSinTraspaso {
  readonly tipo: 'aviso';
  readonly motivo: MotivoAvisoSinTraspaso;
  readonly enlace?: string;
}

/** Un cliente que escribió bajo control humano y no recibe respuesta (NTF7). */
export interface DatosAvisoEspera {
  readonly tipo: 'espera';
  readonly esperaMin: number;
  readonly enlace?: string;
}

export type DatosAviso = DatosAvisoLead | DatosAvisoTraspaso | DatosAvisoSinTraspaso | DatosAvisoEspera;

const OMITIDO = '[dato omitido]';
const LARGO_MAXIMO_RESUMEN = 400;

const CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const DIRECCION =
  /\b(?:calle|carrera|cra|cr|kr|avenida|av|diagonal|diag|transversal|tv|cll|cl)\.?\s*\d+[a-z]?(?:\s*(?:bis|sur|norte|este|oeste))?\s*(?:#|no\.?|n°|nro\.?)\s*\d+[a-z]?\s*[-–]\s*\d+/gi;
const SECUENCIA_DE_DIGITOS = /\+?\d(?:[\s.\-–]*\d)+/g;
const DIGITOS_MINIMOS = 7;

/**
 * Segunda barrera de R14: `leads` ya redacta el resumen al guardarlo, pero un aviso sale a un servicio
 * externo (Telegram), así que se vuelve a omitir cualquier correo, dirección o cifra de siete o más
 * dígitos. Es una copia deliberada de la regla de `leads`: `notificaciones` no depende de `leads`.
 */
function sinDatosPersonales(texto: string): string {
  return texto
    .replace(CORREO, OMITIDO)
    .replace(DIRECCION, OMITIDO)
    .replace(SECUENCIA_DE_DIGITOS, (secuencia) =>
      secuencia.replace(/\D/g, '').length >= DIGITOS_MINIMOS ? OMITIDO : secuencia,
    );
}

const TITULO_TRASPASO: Readonly<Record<MotivoTraspaso, string>> = {
  'tope-turnos': 'el bot llegó al tope de turnos con un cliente.',
  'fallo-llm': 'el bot no pudo responder por una falla técnica.',
  'techo-gasto': 'el bot dejó de responder por el techo de gasto.',
  'audio-repetido': 'el cliente insiste con audios y el bot no los procesa.',
  'argumentos-invalidos': 'el bot no pudo completar una consulta.',
  'plazo-agotado': 'el bot se quedó sin tiempo para responder.',
};

const TITULO_AVISO: Readonly<Record<MotivoAvisoSinTraspaso, string>> = {
  'pide-persona': 'el cliente pidió hablar con una persona.',
  'pide-asesor': 'el bot pidió que un asesor intervenga en esta conversación.',
  'audio-repetido': 'el cliente insiste con audios y el bot no los procesa.',
};

function lineaAtender(enlace: string | undefined): string[] {
  return enlace === undefined ? [] : [`Atender: ${enlace}`];
}

function armarAvisoLead(datos: DatosAvisoLead): string {
  const titulo =
    datos.tipo === 'recordatorio'
      ? `Lead ${datos.temperatura} sin atender: nadie lo ha recogido todavía.`
      : `Lead ${datos.temperatura}: un cliente necesita un asesor.`;
  const lineas = [titulo];
  if (datos.capturadoFueraHorario) {
    lineas.push('Dejó sus datos fuera de horario: hay que contactarlo para confirmar.');
  }
  if (datos.producto !== undefined && datos.producto.trim().length > 0) {
    lineas.push(`Producto: ${sinDatosPersonales(datos.producto.trim())}`);
  }
  if (datos.senales.length > 0) {
    lineas.push(`Señales: ${datos.senales.join(', ')}`);
  }
  const resumen = sinDatosPersonales(datos.resumen).slice(0, LARGO_MAXIMO_RESUMEN);
  lineas.push(`Resumen: ${resumen}`);
  lineas.push(...lineaAtender(datos.enlace));
  return lineas.join('\n');
}

/**
 * Arma el texto plano del aviso (NTF1, D9; NTF5-NTF7 de la Fase 08d): el motivo en claro, el producto, las señales y
 * el resumen del lead, y el enlace a la conversación en una línea propia. Nunca lleva teléfono, cédula, correo,
 * dirección ni nombre del cliente. Texto plano, sin `parse_mode`, para que nada del cliente se interprete como
 * formato (matriz de amenazas de la Fase 08) y Telegram vuelva tocable la URL.
 */
export function armarAviso(datos: DatosAviso): string {
  if (datos.tipo === 'traspaso') {
    return [
      `Traspaso: ${TITULO_TRASPASO[datos.motivo]}`,
      'Un asesor debe continuar la conversación.',
      ...lineaAtender(datos.enlace),
    ].join('\n');
  }
  if (datos.tipo === 'aviso') {
    return [
      `Aviso: ${TITULO_AVISO[datos.motivo]}`,
      'El bot sigue atendiendo la conversación.',
      ...lineaAtender(datos.enlace),
    ].join('\n');
  }
  if (datos.tipo === 'espera') {
    const minutos = Math.max(0, Math.floor(datos.esperaMin));
    return [
      `Cliente esperando: escribió hace ${minutos} min y nadie ha respondido.`,
      ...lineaAtender(datos.enlace),
    ].join('\n');
  }
  return armarAvisoLead(datos);
}
