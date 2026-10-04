import { normalizarTexto } from '../../../compartido/texto/index.js';

const PERSONA = '(?:persona|asesor|asesora|humano|humana|agente|alguien|ejecutivo|ejecutiva)';
const VERBO_CONTACTO =
  '(?:hablar|conversar|comunicar(?:me)?|comunicame|comuniquenme|contactar(?:me)?|contactenme|pasar(?:me)?|pasame|paseme|transferir(?:me)?|transfiereme)';

const PIDE = [
  // "quiero hablar con un asesor", "pásame con un humano", "comunícame con alguien"
  new RegExp(`\\b${VERBO_CONTACTO}\\b.{0,25}\\bcon\\b.{0,15}\\b${PERSONA}\\b`),
  // "quiero un asesor", "necesito una persona"
  new RegExp(`\\b(?:quiero|necesito|prefiero|requiero|pido)\\b.{0,12}\\b(?:un|una)\\s+${PERSONA}\\b`),
  // "que me atienda una persona", "atiéndame una persona"
  /\b(?:que\s+me\s+atienda|atiendame)\b.{0,12}\b(?:una?\s+)?(?:persona|asesor|asesora|humano|humana)\b/,
  // "prefiero hablar con alguien de verdad"
  /\bhablar\s+con\s+alguien\s+de\s+verdad\b/,
];

/** "no quiero hablar con un robot": rechazar al bot equivale a pedir una persona. */
const RECHAZA_BOT =
  /\bno\s+(?:quiero|deseo|me\s+gusta)\s+(?:hablar|chatear|escribir)\s+con\s+(?:un\s+)?(?:bot|robot|maquina|ia|inteligencia\s+artificial)\b/;

/** "no quiero hablar con una persona", "no necesito un asesor": la petición está negada. */
const NIEGA =
  new RegExp(`\\b(?:no|tampoco)\\s+(?:quiero|necesito|deseo|hace\\s+falta|requiero)\\b.{0,25}\\b${PERSONA}\\b`);

/**
 * Detecta con reglas deterministas que el cliente pide hablar con una persona (D6 de la Fase 08, R9,
 * LDS3): no pasa por el LLM. Solo la petición explícita cuenta; mencionar la palabra ("¿el asesor
 * atiende los sábados?") o negarla ("no necesito un asesor") no deriva. Texto normalizado sin tildes.
 */
export function detectarPidePersona(texto: string): boolean {
  const normalizado = normalizarTexto(texto);
  if (normalizado.length === 0) {
    return false;
  }
  if (RECHAZA_BOT.test(normalizado)) {
    return true;
  }
  if (NIEGA.test(normalizado)) {
    return false;
  }
  return PIDE.some((patron) => patron.test(normalizado));
}
