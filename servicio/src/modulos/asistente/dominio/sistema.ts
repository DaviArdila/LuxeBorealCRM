/**
 * La lista cerrada de casos del sistema (CAS4, D2 de la Fase 12): los textos que el **código** envía solo, sin pasar
 * por el LLM. «Contra entrega», «Sin cobertura de envío» y la captura completa dejaron de serlo en la Fase 12d (CAS14):
 * son casos de uso del dueño y el código ya no los lee. Es la única
 * lista que el código necesita: una situación nueva exige código que la detecte, así que no se crea desde la API. Los
 * demás módulos importan la clave de aquí; el texto de respaldo (el del prototipo, P31, o el aprobado por el negocio)
 * rige mientras no haya un caso guardado, así el bot nunca se queda sin texto que enviar.
 */
export interface DefinicionCasoSistema {
  readonly clave: string;
  readonly titulo: string;
  /** Cuándo se envía; es el «cuándo aplica» que ve el admin. */
  readonly descripcion: string;
  readonly categoriaInicial: 'Sistema' | 'Políticas';
  readonly disparador: 'evento' | 'intencion';
  readonly textoRespaldo: string;
}

export const CASOS_DEL_SISTEMA = [
  {
    clave: 'mensaje_pedir_texto_audio',
    titulo: 'Audio recibido',
    descripcion: 'Cuando el cliente manda un audio: el bot le pide que escriba su mensaje, porque todavía no escucha audios.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'Por acá no puedo escuchar audios todavía, ¿me lo escribes en texto porfa?',
  },
  {
    clave: 'mensaje_imagen_no_procesada',
    titulo: 'Imagen sin texto',
    descripcion: 'Cuando el cliente manda una imagen sin texto: el bot le pide que cuente qué producto busca o que dé el SKU.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'No puedo ver la imagen todavía — ¿me cuentas en texto qué producto buscas, o me das el SKU?',
  },
  {
    clave: 'aviso_datos',
    titulo: 'Aviso de datos',
    descripcion:
      'Aviso de asistente automatizado y del uso de sus datos, que el cliente ve al inicio de cada conversación. Es el aviso que exige la política de privacidad (R14): no lo dejes vacío ni le quites que habla con un asistente automatizado.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'Soy un asistente automatizado. Tus datos se usan solo para gestionar tu pedido.',
  },
  {
    clave: 'mensaje_handoff',
    titulo: 'Traspaso a un asesor',
    descripcion: 'Cuando el bot pasa la conversación a un asesor dentro del horario de atención.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'Te paso con un asesor para cerrar los detalles — te escribe en un momento.',
  },
  {
    clave: 'mensaje_handoff_fuera_horario',
    titulo: 'Traspaso fuera de horario',
    descripcion: 'Cuando el bot pasa la conversación a un asesor fuera del horario de atención.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'En este momento no hay un asesor disponible; apenas abramos te escribimos para cerrar los detalles.',
  },
  {
    // P31: el texto del prototipo, que ya está en uso real.
    clave: 'mensaje_error_llm',
    titulo: 'Falla técnica del modelo',
    descripcion: 'Cuando el bot no puede responder por una falla técnica del modelo: el cliente lo ve y la conversación pasa a un asesor.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'Ya te respondemos en un momento.',
  },
  {
    clave: 'mensaje_espera_handoff',
    titulo: 'Espera del traspaso',
    descripcion:
      'Aviso único cuando el cliente vuelve a escribir mientras espera que un asesor lo atienda: lo tranquiliza y le dice que ya viene alguien.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'Seguimos aquí. Un asesor te va a atender en breve, gracias por tu paciencia.',
  },
  {
    // P22: neutro, no revela el límite de gasto ni promete una hora de respuesta.
    clave: 'mensaje_techo_gasto',
    titulo: 'Techo de gasto alcanzado',
    descripcion:
      'Cuando se alcanza el techo mensual de gasto del modelo: el cliente lo ve y la conversación pasa a un asesor. No debe revelar el límite ni prometer una hora.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'Gracias por escribirnos. En este momento te atiende directamente un asesor, que te responderá en breve.',
  },
] as const satisfies readonly DefinicionCasoSistema[];

/** Las categorías con las que nace el asistente y su orden (CAS6); también donde se crea un caso del sistema que falte. */
export const CATEGORIAS_INICIALES = [
  { nombre: 'Sistema', orden: 0 },
  { nombre: 'Políticas', orden: 1 },
] as const;

/** Una clave de la lista cerrada: lo que los módulos piden por el puerto de textos. */
export type ClaveSistema = (typeof CASOS_DEL_SISTEMA)[number]['clave'];

/** El texto que rige cuando no hay un caso guardado para la clave (CAS7). */
export function textoDeRespaldo(clave: ClaveSistema): string {
  const definicion = CASOS_DEL_SISTEMA.find((caso) => caso.clave === clave);
  return definicion === undefined ? '' : definicion.textoRespaldo;
}

/** La definición de una clave de la lista cerrada (CAS4). */
export function definicionDe(clave: ClaveSistema): DefinicionCasoSistema {
  const definicion = CASOS_DEL_SISTEMA.find((caso) => caso.clave === clave);
  if (definicion === undefined) throw new Error(`clave del sistema desconocida: ${clave}`);
  return definicion;
}
