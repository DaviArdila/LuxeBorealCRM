/** Lo que un aviso al asesor sabe de un lead (D9 de la Fase 08): nunca datos de contacto (R14). */
export interface DatosAviso {
  readonly tipo: 'lead' | 'recordatorio';
  readonly temperatura: string;
  readonly senales: readonly string[];
  readonly resumen: string;
  readonly capturadoFueraHorario: boolean;
}

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

/**
 * Arma el texto plano del aviso (NTF1, D9): temperatura, señales y resumen del lead, sin teléfono,
 * cédula, correo ni dirección. Texto plano, sin `parse_mode`, para que nada del cliente se interprete
 * como formato (matriz de amenazas de la Fase 08).
 */
export function armarAviso(datos: DatosAviso): string {
  const titulo =
    datos.tipo === 'recordatorio'
      ? `Lead ${datos.temperatura} sin atender: nadie lo ha recogido todavía.`
      : `Lead ${datos.temperatura}: un cliente necesita un asesor.`;
  const lineas = [titulo];
  if (datos.capturadoFueraHorario) {
    lineas.push('Dejó sus datos fuera de horario: hay que contactarlo para confirmar.');
  }
  if (datos.senales.length > 0) {
    lineas.push(`Señales: ${datos.senales.join(', ')}`);
  }
  const resumen = sinDatosPersonales(datos.resumen).slice(0, LARGO_MAXIMO_RESUMEN);
  lineas.push(`Resumen: ${resumen}`);
  return lineas.join('\n');
}
