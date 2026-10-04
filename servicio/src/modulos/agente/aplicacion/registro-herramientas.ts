import type { DefinicionHerramienta } from '../../llm/index.js';
import type { Herramienta } from '../dominio/herramienta.js';

/**
 * Registro de las herramientas del agente (D1 de la Fase 07b). Se construye al arrancar: dos
 * herramientas con el mismo nombre, o un total distinto del esperado (R1: exactamente siete), hacen
 * fallar el arranque en vez de descubrirse en producción. El bucle solo pregunta por nombre.
 */
export class RegistroHerramientas {
  private readonly porNombre = new Map<string, Herramienta>();

  constructor(herramientas: readonly Herramienta[], esperadas?: number) {
    for (const herramienta of herramientas) {
      const nombre = herramienta.definicion.nombre;
      if (this.porNombre.has(nombre)) {
        throw new Error(`Herramienta duplicada en el registro del agente: "${nombre}"`);
      }
      this.porNombre.set(nombre, herramienta);
    }
    if (esperadas !== undefined && this.porNombre.size !== esperadas) {
      throw new Error(
        `El agente MUST registrar exactamente ${String(esperadas)} herramientas (R1); hay ${String(this.porNombre.size)}`,
      );
    }
  }

  obtener(nombre: string): Herramienta | undefined {
    return this.porNombre.get(nombre);
  }

  definiciones(): readonly DefinicionHerramienta[] {
    return [...this.porNombre.values()].map((herramienta) => herramienta.definicion);
  }
}
