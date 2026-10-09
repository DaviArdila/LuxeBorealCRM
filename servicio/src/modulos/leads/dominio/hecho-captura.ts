/**
 * El hecho de la captura de datos fuera de horario (LDS4, R10): un solo texto que dicen tanto el contexto del turno
 * (`agente`) como la respuesta de `marcar_lead_caliente` (`EvaluarPropuestaLead`). Es un hecho, no un guion: no ordena
 * qué pedir, en qué orden ni con qué texto despedirse; esa conducta la define un caso de uso del dueño.
 */
export const HECHO_CAPTURA_PENDIENTE =
  'Fuera de horario; el cliente mostró intención de compra y faltan sus datos de contacto ' +
  '(nombre completo, teléfono de contacto, dirección y localidad).';
