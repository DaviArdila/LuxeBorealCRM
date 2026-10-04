import type { Clock } from '../../src/plataforma/reloj/index.js';
import type { LimiteIntentos, ResultadoIntento } from '../../src/modulos/usuarios/puertos/limite-intentos.js';

/** Doble de test de {@link LimiteIntentos}: misma regla que el adaptador de Redis, con la ventana leída del reloj. */
export class LimiteIntentosEnMemoria implements LimiteIntentos {
  private readonly contadores = new Map<string, { conteo: number; venceEn: number }>();

  constructor(
    private readonly clock: Clock,
    private readonly maximo: number,
    private readonly ventanaMin: number,
  ) {}

  consumirIntento(email: string, ip: string): Promise<ResultadoIntento> {
    const clave = `${email.trim().toLowerCase()}|${ip}`;
    const ahora = this.clock.ahora().getTime();
    const actual = this.contadores.get(clave);
    const contador =
      actual === undefined || actual.venceEn <= ahora
        ? { conteo: 0, venceEn: ahora + this.ventanaMin * 60_000 }
        : actual;
    contador.conteo += 1;
    this.contadores.set(clave, contador);
    if (contador.conteo <= this.maximo) return Promise.resolve({ permitido: true });
    return Promise.resolve({ permitido: false, reintentarEnS: Math.ceil((contador.venceEn - ahora) / 1000) });
  }

  reiniciar(email: string, ip: string): Promise<void> {
    this.contadores.delete(`${email.trim().toLowerCase()}|${ip}`);
    return Promise.resolve();
  }
}
