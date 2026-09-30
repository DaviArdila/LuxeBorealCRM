/**
 * Anonimizador del set dorado (D8 de la Fase 07c, EVL5, R14). Lógica pura, sin dependencias de `src/`:
 * reemplaza teléfonos, correos, cédulas, direcciones y nombres propios por marcadores estables
 * (`<TELEFONO_1>`, `<NOMBRE_1>`…) y luego verifica, con reglas más amplias que las de reemplazo, que no
 * sobreviva ningún dato personal. Falla cerrado: ante la duda (p. ej. una cifra de siete o más dígitos)
 * rechaza el texto y una persona lo reescribe.
 */

type Categoria = 'TELEFONO' | 'CORREO' | 'CEDULA' | 'NOMBRE' | 'DIRECCION';

/** Error de la verificación final; nunca incluye el dato que sobrevivió. */
export class ErrorDatoPersonalResidual extends Error {
  constructor(cantidad: number) {
    super(
      `Quedan ${String(cantidad)} patrón(es) de datos personales (teléfono, correo o cédula) tras anonimizar; ` +
        'no se escribió ningún archivo. Reescribe ese fragmento a mano.',
    );
    this.name = 'ErrorDatoPersonalResidual';
  }
}

function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Asigna un número estable por categoría y por dato: el mismo dato siempre recibe el mismo marcador. */
export class TablaMarcadores {
  private readonly porCategoria = new Map<Categoria, Map<string, number>>();

  marcador(categoria: Categoria, clave: string): string {
    const tabla = this.porCategoria.get(categoria) ?? new Map<string, number>();
    this.porCategoria.set(categoria, tabla);
    const numero = tabla.get(clave) ?? tabla.size + 1;
    tabla.set(clave, numero);
    return `<${categoria}_${String(numero)}>`;
  }
}

const CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const DIRECCION =
  /\b(?:calle|carrera|cra|cr|kr|avenida|av|diagonal|diag|transversal|tv|cll|cl)\.?\s*\d+[a-z]?(?:\s*(?:bis|sur|norte|este|oeste))?\s*(?:#|no\.?|n°|nro\.?)\s*\d+[a-z]?\s*[-–]\s*\d+/gi;
const TELEFONO = /(?:\+?57[\s.-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g;
const CEDULA = /\b\d{1,3}(?:\.\d{3}){2,3}\b|\b\d{8,10}\b/g;

const CLASES_ACENTO: Readonly<Record<string, string>> = {
  a: '[aáàäâ]',
  e: '[eéèëê]',
  i: '[iíìïî]',
  o: '[oóòöô]',
  u: '[uúùüû]',
  n: '[nñ]',
};

function patronDeNombre(nombre: string): RegExp {
  const cuerpo = [...sinTildes(nombre)]
    .map((c) => (c === ' ' ? '\\s+' : (CLASES_ACENTO[c] ?? c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))))
    .join('');
  return new RegExp(`(?<![\\p{L}\\p{N}])${cuerpo}(?![\\p{L}\\p{N}])`, 'giu');
}

/** Nombres a buscar: cada uno completo y, si tiene varias palabras, cada palabra suelta con la misma clave. */
function alias(nombres: readonly string[]): { readonly texto: string; readonly clave: string }[] {
  const lista = nombres.flatMap((nombre) => {
    const clave = sinTildes(nombre);
    const palabras = clave.split(' ').filter((palabra) => palabra.length >= 3);
    return [{ texto: nombre, clave }, ...(palabras.length > 1 ? palabras.map((texto) => ({ texto, clave })) : [])];
  });
  return lista.sort((a, b) => b.texto.length - a.texto.length);
}

export function anonimizar(texto: string, nombres: readonly string[], tabla: TablaMarcadores): string {
  let resultado = texto.replace(CORREO, (dato) => tabla.marcador('CORREO', dato.toLowerCase()));
  resultado = resultado.replace(DIRECCION, (dato) => tabla.marcador('DIRECCION', sinTildes(dato)));
  resultado = resultado.replace(TELEFONO, (dato) => tabla.marcador('TELEFONO', dato.replace(/\D/g, '').slice(-10)));
  resultado = resultado.replace(CEDULA, (dato) => tabla.marcador('CEDULA', dato.replace(/\D/g, '')));
  for (const { texto: nombre, clave } of alias(nombres)) {
    resultado = resultado.replace(patronDeNombre(nombre), () => tabla.marcador('NOMBRE', clave));
  }
  return resultado;
}

const SECUENCIA_DE_DIGITOS = /\d(?:[\s.\-–]*\d)+/g;
const DIGITOS_MINIMOS_RESIDUALES = 7;

/**
 * Verificación final, deliberadamente más amplia que el reemplazo (EVL5): cualquier arroba o cualquier
 * secuencia de siete o más dígitos, aunque vengan separados por espacios, puntos o guiones.
 */
export function verificarSinDatosPersonales(texto: string): void {
  const secuencias = (texto.match(SECUENCIA_DE_DIGITOS) ?? []).filter(
    (secuencia) => secuencia.replace(/\D/g, '').length >= DIGITOS_MINIMOS_RESIDUALES,
  );
  const arrobas = texto.includes('@') ? 1 : 0;
  if (secuencias.length + arrobas > 0) {
    throw new ErrorDatoPersonalResidual(secuencias.length + arrobas);
  }
}

interface MensajeChatwoot {
  readonly message_type?: number;
  readonly content?: string | null;
  readonly sender?: { readonly name?: string | null } | null;
}

export interface RespuestaMensajesChatwoot {
  readonly meta?: { readonly contact?: { readonly name?: string | null } | null } | null;
  readonly payload?: readonly MensajeChatwoot[];
}

export interface CasoCrudo {
  readonly id: string;
  readonly titulo: string;
  readonly origen: 'real-anonimizado';
  /** Vacíos a propósito: la carga del caso falla hasta que una persona lo revise y los complete. */
  readonly revisadoPor: string;
  readonly fecha: string;
  readonly turnos: readonly {
    readonly mensajes: readonly { readonly tipoContenido: 'texto'; readonly texto: string }[];
    readonly aserciones: Record<string, never>;
  }[];
}

/**
 * Convierte la respuesta de `GET .../conversations/{id}/messages` de Chatwoot en un caso del set dorado:
 * cada mensaje entrante del cliente (`message_type` 0) es un turno; lo que dijo el bot o un asesor se
 * descarta porque en modo real lo genera el modelo. Todo texto pasa por `anonimizar` y, antes de
 * devolver el caso, por la verificación final: si falla, no hay caso que escribir.
 */
export function casoDesdeChatwoot(
  respuesta: RespuestaMensajesChatwoot,
  opciones: { readonly id: string; readonly nombres: readonly string[]; readonly titulo?: string },
): CasoCrudo {
  const entrantes = (respuesta.payload ?? []).filter(
    (mensaje) => mensaje.message_type === 0 && (mensaje.content ?? '').trim().length > 0,
  );
  const nombres = [
    ...opciones.nombres,
    ...(respuesta.meta?.contact?.name ? [respuesta.meta.contact.name] : []),
    ...entrantes.flatMap((mensaje) => (mensaje.sender?.name ? [mensaje.sender.name] : [])),
  ];
  const tabla = new TablaMarcadores();
  const turnos = entrantes.map((mensaje) => {
    const texto = anonimizar(mensaje.content ?? '', nombres, tabla);
    verificarSinDatosPersonales(texto);
    return { mensajes: [{ tipoContenido: 'texto' as const, texto }], aserciones: {} };
  });
  return {
    id: opciones.id,
    titulo: opciones.titulo ?? `Conversación real ${opciones.id}`,
    origen: 'real-anonimizado',
    revisadoPor: '',
    fecha: '',
    turnos,
  };
}
