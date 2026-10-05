/**
 * Mapeo de `conversation.channel` (crudo de Chatwoot) al `CanalOrigen` propio del dominio (D14).
 * Usa exactamente los valores del enum `canal_conversacion` ya migrado (`schema.prisma`), para que
 * la Fase 05 lo persista sin traducir. Vive en `infraestructura/` porque conoce los nombres de
 * clase de Chatwoot (D1, regla `dominio-aislado`: el dominio no habla Chatwoot).
 */
import type { CanalOrigen } from '../../dominio/evento-canal.js';

const MAPA_CANAL: Readonly<Record<string, CanalOrigen>> = {
  'Channel::Whatsapp': 'whatsapp',
  'Channel::Instagram': 'instagram',
  'Channel::FacebookPage': 'messenger',
  'Channel::WebWidget': 'web',
};

/**
 * Cualquier canal sin mapeo explícito (incluido `Channel::Api`, el inbox de pruebas local de los
 * fixtures de T1) cae en `'otro'`, nunca en un valor inventado (D14, CAN8).
 */
export function canalDesdeChatwoot(channel: string | null | undefined): CanalOrigen {
  if (!channel) return 'otro';
  return MAPA_CANAL[channel] ?? 'otro';
}
