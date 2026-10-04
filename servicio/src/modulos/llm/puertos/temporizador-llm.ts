export const TEMPORIZADOR_LLM = Symbol('TEMPORIZADOR_LLM');

// Puerto interno del módulo: aísla del reloj lo no determinista del gateway (backoff, jitter y el
// aborto por timeout) para probarlo sin esperas reales. El tiempo transcurrido sigue saliendo del
// `Clock` inyectado.
export interface TemporizadorLlm {
  esperar(ms: number): Promise<void>;
  // Número uniforme en [0, 1) para el jitter del backoff (D4).
  azar(): number;
  // Ejecuta `accion` tras `ms`; devuelve la función que la cancela.
  programar(ms: number, accion: () => void): () => void;
}
