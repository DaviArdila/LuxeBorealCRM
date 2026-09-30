import { detectarPidePersona } from './detectar-pide-persona.js';

// Escenarios LDS3 de la spec de la Fase 08 (R9): la petición explícita se detecta sin LLM.

describe('modulos/leads/dominio — detectarPidePersona (LDS3, D6)', () => {
  it.each([
    'quiero hablar con un asesor',
    'Necesito hablar con una persona, por favor',
    'pásame con un humano',
    'comunícame con un agente',
    'quiero un asesor',
    'que me atienda una persona',
    'prefiero hablar con alguien de verdad',
  ])('LDS3 — Petición explícita de hablar con una persona: "%s"', (texto) => {
    expect(detectarPidePersona(texto)).toBe(true);
  });

  it('LDS3 — Rechazar hablar con un bot también deriva', () => {
    expect(detectarPidePersona('no quiero hablar con un robot, pásame con alguien')).toBe(true);
    expect(detectarPidePersona('No quiero hablar con un bot')).toBe(true);
  });

  it.each([
    '¿el asesor de ustedes atiende los sábados?',
    'hola, busco un collar de plata',
    'mi asesora me recomendó este anillo',
    'tengo un amigo que es asesor financiero',
    'cuánto cuesta el envío a Medellín',
  ])('LDS3 — Mencionar la palabra no es pedirla: "%s"', (texto) => {
    expect(detectarPidePersona(texto)).toBe(false);
  });

  it('una negación de la petición no deriva', () => {
    expect(detectarPidePersona('no quiero hablar con una persona, prefiero seguir con el bot')).toBe(false);
    expect(detectarPidePersona('no necesito un asesor, gracias')).toBe(false);
  });

  it('ignora tildes y mayúsculas', () => {
    expect(detectarPidePersona('PÁSAME CON UN ASESOR')).toBe(true);
  });

  it('un texto vacío no deriva', () => {
    expect(detectarPidePersona('')).toBe(false);
    expect(detectarPidePersona('   ')).toBe(false);
  });
});
