/**
 * Catálogo de códigos de error estables (D5 de `design.md`, ADR-0011 propuesta). `CodigoError` se
 * deriva de las claves de este objeto: un código fuera del catálogo no compila (skill
 * `luxeboreal-arquitectura` §8, kebab-case en español). Cada fase que agregue un error nuevo
 * agrega su propia entrada aquí, con el id del requisito en el comentario — la Fase 11a agrega
 * los cinco de autenticación, la 11b los del estilo y de los mensajes fijos y las Fases 12-13 `clave-idempotencia-*` (design.md D5);
 * la Fase 04 (T3, D2/D3 de `design.md`) agrega `firma-invalida` y `carga-demasiado-grande` para el
 * webhook de Chatwoot.
 */
export const CATALOGO_CODIGOS = Object.freeze({
  /** API4: el cuerpo de la petición no cumple el esquema Standard Schema del endpoint. */
  'validacion-fallida': {
    status: 400,
    title: 'La petición no cumple el esquema del endpoint',
  },
  /** API4: una excepción no capturada por el código de la aplicación. */
  'error-interno': {
    status: 500,
    title: 'Ocurrió un error inesperado',
  },
  /** R3, D3 de la Fase 04: firma HMAC ausente, inválida o fuera de tolerancia del webhook. */
  'firma-invalida': {
    status: 401,
    title: 'La firma de la petición es inválida o está ausente',
  },
  /** D2 de la Fase 04: el cuerpo de la petición supera el límite de tamaño configurado. */
  'carga-demasiado-grande': {
    status: 413,
    title: 'El cuerpo de la petición supera el límite de tamaño permitido',
  },
  /** USR1: correo inexistente, contraseña incorrecta o usuario inactivo responden igual. */
  'credenciales-invalidas': {
    status: 401,
    title: 'Las credenciales no son válidas',
  },
  /** USR3, USR5, USR6, API7: sin sesión, o con una sesión vencida, cerrada o de un usuario inactivo. */
  'peticion-no-autenticada': {
    status: 401,
    title: 'La petición necesita una sesión válida',
  },
  /** USR6, API7: la sesión es válida pero su rol no alcanza para la operación. */
  'rol-insuficiente': {
    status: 403,
    title: 'El rol de la sesión no permite esta operación',
  },
  /** USR7: una mutación bajo /api/v1 llegó sin el encabezado X-Luxe-Csrf. */
  'encabezado-csrf-ausente': {
    status: 403,
    title: 'Falta el encabezado anti-CSRF de la petición',
  },
  /** USR8: la pareja correo e IP agotó sus intentos de inicio de sesión en la ventana. */
  'demasiados-intentos': {
    status: 429,
    title: 'Demasiados intentos de inicio de sesión; intenta más tarde',
  },
  /** AGT23: el estilo que se intentó publicar o restaurar no cumple AGT20; el motivo va en `detail`. */
  'estilo-invalido': {
    status: 422,
    title: 'El estilo no cumple las reglas para publicarse',
  },
  /** AGT23: la versión que se pidió restaurar no está en el historial del estilo. */
  'version-estilo-inexistente': {
    status: 404,
    title: 'La versión del estilo no existe en el historial',
  },
  /** EST-API: la sección del estilo pedida no existe. */
  'seccion-inexistente': {
    status: 404,
    title: 'La sección del estilo no existe',
  },
  /** EST-API: ya existe una sección con ese título (sin distinguir mayúsculas ni acentos). */
  'seccion-duplicada': {
    status: 409,
    title: 'Ya existe una sección del estilo con ese título',
  },
  /** EST-API: otro admin modificó la sección después de que este la leyó. */
  'seccion-modificada': {
    status: 409,
    title: 'La sección del estilo cambió desde que la leíste',
  },
  /** EST-API: el orden pedido no coincide con las secciones existentes. */
  'orden-secciones-invalido': {
    status: 422,
    title: 'El orden no incluye exactamente las secciones existentes',
  },
  /** CAS1, CAS9: ya existe una categoría con ese nombre (sin distinguir mayúsculas ni acentos). */
  'categoria-duplicada': {
    status: 409,
    title: 'Ya existe una categoría con ese nombre',
  },
  /** CAS2, CAS9: la categoría tiene casos; primero hay que moverlos o borrarlos. */
  'categoria-con-casos': {
    status: 409,
    title: 'La categoría tiene casos y no se puede borrar',
  },
  /** CAS1, CAS9: la categoría pedida no existe. */
  'categoria-inexistente': {
    status: 404,
    title: 'La categoría no existe',
  },
  /** CAS2: el nombre de la categoría está vacío o es demasiado largo; el motivo va en `detail`. */
  'categoria-invalida': {
    status: 422,
    title: 'El nombre de la categoría no cumple las reglas para guardarse',
  },
  /** CAS2: el orden pedido no coincide con las categorías existentes. */
  'orden-categorias-invalido': {
    status: 422,
    title: 'El orden no incluye exactamente las categorías existentes',
  },
  /** CAS1, CAS9: ya existe un caso con ese título (sin distinguir mayúsculas ni acentos). */
  'caso-duplicado': {
    status: 409,
    title: 'Ya existe un caso con ese título',
  },
  /** CAS9: el caso pedido no existe. */
  'caso-inexistente': {
    status: 404,
    title: 'El caso no existe',
  },
  /** CAS4: un caso con clave del sistema se edita pero no se borra ni se desactiva. */
  'caso-del-sistema': {
    status: 409,
    title: 'Un caso del sistema no se puede borrar ni desactivar',
  },
  /** CAS3: otro admin modificó el caso después de que este lo leyó. */
  'caso-modificado': {
    status: 409,
    title: 'El caso cambió desde que lo leíste',
  },
  /** CAS5: el caso incumple las reglas para guardarse; el motivo (sin copiar el texto) va en `detail`. */
  'caso-invalido': {
    status: 422,
    title: 'El caso no cumple las reglas para guardarse',
  },
  /** CFG1: un campo de un grupo de configuración no cumple su tipo o rango; el motivo de cada campo va en `detail`. */
  'configuracion-invalida': {
    status: 422,
    title: 'La configuración no cumple las reglas para guardarse',
  },
  /** CFG2: ya existe una excepción de horario para esa fecha. */
  'excepcion-duplicada': {
    status: 409,
    title: 'Ya existe una excepción de horario para esa fecha',
  },
  /** CFG2: la excepción de horario que se quiso borrar no existe. */
  'excepcion-inexistente': {
    status: 404,
    title: 'La excepción de horario no existe',
  },
  /** API5, CAS10: el cursor del listado no se pudo leer. */
  'cursor-invalido': {
    status: 400,
    title: 'El cursor del listado no es válido',
  },
} as const);

/** Un código fuera de {@link CATALOGO_CODIGOS} no compila (D5). */
export type CodigoError = keyof typeof CATALOGO_CODIGOS;
