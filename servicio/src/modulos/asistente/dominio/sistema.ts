/**
 * La lista cerrada de casos del sistema (CAS4, D2 de la Fase 12): los textos que el **código** envía solo, sin pasar
 * por el LLM. En la Fase 12d (CAS4, CAS14) quedó en cinco; el ADR-0028 le suma los cuatro textos de la barrera de consentimiento y los dos títulos de sus botones (once en total): «Contra entrega», «Sin cobertura de envío» y la captura completa
 * son casos de uso del dueño; el aviso de datos es `consentimiento_aviso`, que envía la barrera (el caso de intención «Tratamiento de datos» se retiró de la semilla); los dos traspasos los reemplaza el aviso
 * al asesor. En la API de un caso del sistema solo se edita el texto (CAS4): título, categoría, «cuándo aplica» y modo quedan
 * fijos, porque el código lo dispara por su clave. El código ya no lee esas claves. El título de respaldo de un caso nuevo es el de aquí; una base existente
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
  /**
   * Tope de caracteres del texto cuando el caso es un dato con un límite del canal, no un mensaje: los títulos de los botones
   * de WhatsApp (20, Meta). Lo exigen la edición (`validarCaso`) y quien lo lee, que cae al respaldo si lo supera.
   */
  readonly maximoCaracteres?: number;
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
  {
    // ADR-0028: la barrera de consentimiento; el texto de aviso respeta el que el dueño ya editó (aviso_datos).
    clave: 'consentimiento_aviso',
    titulo: 'Aviso de tratamiento de datos',
    descripcion:
      'Primer mensaje a un contacto que aún no respondió al tratamiento de datos: se presenta como asistente automatizado y pide SÍ o NO. El bot no sigue hasta que acepte.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo:
      'Hola, soy el asistente virtual de LuxeBoreal. Para atenderte necesitamos guardar tus datos personales (nombre, teléfono y lo que nos escribas) y tratarlos según la Ley 1581 de 2012 y nuestra política de privacidad. Los usamos solo para atenderte y gestionar tu compra o pedido, y puedes consultarlos, corregirlos o pedir su eliminación cuando quieras. Sin tu autorización no podemos continuar. ¿Autorizas el tratamiento de tus datos? Responde SÍ o NO.',
  },
  {
    clave: 'consentimiento_recordatorio',
    titulo: 'Recordatorio de tratamiento de datos',
    descripcion:
      'Cuando el contacto que rechazó (o cuyo estado no se pudo leer) vuelve a escribir sin aceptar: le recuerda que necesita su autorización y pide SÍ o NO.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'Para poder ayudarte necesitamos tu autorización de tratamiento de datos. ¿La das? Responde SÍ o NO.',
  },
  {
    clave: 'consentimiento_aceptado',
    titulo: 'Tratamiento de datos aceptado',
    descripcion: 'Cuando el contacto responde SÍ al tratamiento de datos: confirma que quedó registrado y lo invita a continuar.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: '¡Gracias! Ya quedó registrada tu autorización. ¿En qué te puedo ayudar?',
  },
  {
    clave: 'consentimiento_rechazado',
    titulo: 'Tratamiento de datos rechazado',
    descripcion:
      'Cuando el contacto responde NO al tratamiento de datos: explica que sin su autorización no se puede continuar y que puede escribir SÍ cuando quiera.',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo:
      'Entendido, no guardaremos tus datos. Sin tu autorización no podemos continuar la conversación por aquí. Si cambias de idea, responde SÍ y con gusto te atendemos.',
  },
  {
    // Títulos de los botones de respuesta del aviso y del recordatorio. El clic llega como el título (Chatwoot descarta el
    // id), así que la política entiende lo que el dueño edite aquí. Límite de Meta: 20 caracteres.
    clave: 'consentimiento_boton_si',
    titulo: 'Botón «Sí» del aviso de datos',
    descripcion:
      'Título del botón con el que el contacto autoriza el tratamiento de datos, en el aviso y el recordatorio. Máximo 20 caracteres; no debe repetir el del botón «No».',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'Sí, autorizo',
    maximoCaracteres: 20,
  },
  {
    clave: 'consentimiento_boton_no',
    titulo: 'Botón «No» del aviso de datos',
    descripcion:
      'Título del botón con el que el contacto rechaza el tratamiento de datos, en el aviso y el recordatorio. Máximo 20 caracteres; no debe repetir el del botón «Sí».',
    categoriaInicial: 'Sistema',
    disparador: 'evento',
    textoRespaldo: 'No autorizo',
    maximoCaracteres: 20,
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

/** El tope de caracteres del texto de una clave que lo declara (títulos de botones), o `undefined`; acepta cualquier clave. */
export function maximoDeCaracteres(clave: string | null): number | undefined {
  const definiciones: readonly DefinicionCasoSistema[] = CASOS_DEL_SISTEMA;
  return definiciones.find((definicion) => definicion.clave === clave)?.maximoCaracteres;
}
