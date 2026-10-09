/**
 * La lista cerrada de casos del sistema (CAS4, D2 de la Fase 12): los textos que el **código** envía solo, sin pasar
 * por el LLM. En la Fase 12d (CAS4, CAS14) quedó en cinco: «Contra entrega», «Sin cobertura de envío» y la captura completa
 * son casos de uso del dueño; el aviso de datos es el caso «Tratamiento de datos»; los dos traspasos los reemplaza el aviso
 * al asesor. El código ya no lee esas claves. El título de respaldo de un caso nuevo es el de aquí; una base existente
 * conserva el que tiene guardado. Es la única
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
    titulo: 'Espera del asesor',
    descripcion:
      'Aviso único cuando el cliente vuelve a escribir mientras la conversación espera a un asesor tras una falla técnica, el techo de gasto o el tope de turnos: lo tranquiliza y le dice que ya viene alguien.',
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
