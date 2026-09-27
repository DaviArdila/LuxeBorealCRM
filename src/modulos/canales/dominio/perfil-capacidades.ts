/**
 * Perfil de capacidades por canal (D14, CAN8): función pura que traduce `CanalOrigen` a los
 * límites y costos reales del proveedor, sin que el agente (Fase 07) tenga que preguntar por el
 * canal. Solo WhatsApp tiene columna llena (`docs/analisis/05-multicanal.md`); cualquier otro
 * canal devuelve un perfil explícito de "no soportado", nunca un valor "por verificar" inventado.
 * Este archivo no importa nada fuera de `dominio/` (regla `dominio-aislado`).
 */
import type { CanalOrigen } from './evento-canal.js';

/** Tipo de adjunto entrante que el canal soporta (D14; no incluye 'texto'/'sticker'/'otro' de {@link TipoContenido}). */
export type TipoAdjunto = 'imagen' | 'audio' | 'ubicacion' | 'documento' | 'archivo';

export type PerfilCapacidades =
  | {
      readonly soportado: true;
      readonly canal: CanalOrigen;
      readonly ventanaRespuestaHoras: number | null;
      readonly mensajeSalienteTieneCosto: boolean;
      readonly traeTelefono: boolean;
      readonly indicadorEscribiendo: 'meta-directo' | 'chatwoot' | 'ninguno';
      readonly adjuntosEntrantes: readonly TipoAdjunto[];
      readonly limitesInteractivos: { readonly textoBoton: number; readonly descripcionFila: number } | null;
    }
  | { readonly soportado: false; readonly canal: CanalOrigen; readonly motivo: 'canal-no-soportado' };

/**
 * Valores reales de WhatsApp (`docs/analisis/05-multicanal.md`, "Perfil de capacidades"): ventana
 * de 24 h, cobro por mensaje saliente desde el 1-oct-2026 (no se modela como dependiente de la
 * fecha, esta fase no llega a producción antes), indicador "escribiendo…" por llamada directa a
 * Meta (Fase 08), adjuntos entrantes soportados y límites de texto de listas/botones (24/72).
 */
const PERFIL_WHATSAPP: PerfilCapacidades = {
  soportado: true,
  canal: 'whatsapp',
  ventanaRespuestaHoras: 24,
  mensajeSalienteTieneCosto: true,
  traeTelefono: true,
  indicadorEscribiendo: 'meta-directo',
  adjuntosEntrantes: ['imagen', 'audio', 'ubicacion', 'documento'],
  limitesInteractivos: { textoBoton: 24, descripcionFila: 72 },
};

/**
 * CAN8: WhatsApp devuelve su perfil real; cualquier otro canal (incluido el inbox de pruebas local,
 * `Channel::Api` → `'otro'`) devuelve un perfil explícito de no soportado. `docs/analisis/05-
 * multicanal.md` marca las columnas de Instagram/Messenger/Widget como "por verificar": esta fase
 * no las llena, para no inventar un valor que nadie confirmó.
 */
export function perfilDeCapacidades(canal: CanalOrigen): PerfilCapacidades {
  if (canal === 'whatsapp') return PERFIL_WHATSAPP;
  return { soportado: false, canal, motivo: 'canal-no-soportado' };
}
