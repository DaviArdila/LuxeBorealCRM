import type {
  DatosCapturados,
  EstadoConsentimiento,
  RepositorioContactoAgente,
} from '../../src/modulos/agente/puertos/repositorio-contacto-agente.js';
import type { Clock } from '../../src/plataforma/reloj/index.js';
import { ClockFalso } from './clock-falso.js';

/** Doble de test de {@link RepositorioContactoAgente}: nombres y datos guardados a la vista. */
export class RepositorioContactoAgenteEnMemoria implements RepositorioContactoAgente {
  readonly nombres = new Map<string, string>();
  readonly guardados = new Map<string, DatosCapturados>();

  leerNombre(contactoId: string): Promise<string | null> {
    return Promise.resolve(this.nombres.get(contactoId) ?? null);
  }

  /** Consentimiento por contacto; un contacto ausente está `pendiente`. */
  readonly consentimientos = new Map<string, { aceptadoEn: Date | null; rechazadoEn: Date | null }>();
  /** Cuántas veces se registró una respuesta (para afirmar que algo NO se escribió). */
  registros = 0;
  /** Si se fija, `consentimientoDe` y `registrarConsentimiento` fallan con él (AGT25, AGT26). */
  fallo: Error | null = null;

  constructor(private readonly reloj: Clock = new ClockFalso(new Date('2026-10-09T10:00:00.000Z'))) {}

  consentimientoDe(contactoId: string): Promise<EstadoConsentimiento> {
    if (this.fallo !== null) return Promise.reject(this.fallo);
    const fila = this.consentimientos.get(contactoId);
    if (fila?.aceptadoEn != null) return Promise.resolve('aceptado');
    if (fila?.rechazadoEn != null) return Promise.resolve('rechazado');
    return Promise.resolve('pendiente');
  }

  registrarConsentimiento(contactoId: string, acepta: boolean): Promise<void> {
    if (this.fallo !== null) return Promise.reject(this.fallo);
    this.registros += 1;
    const previo = this.consentimientos.get(contactoId) ?? { aceptadoEn: null, rechazadoEn: null };
    const ahora = this.reloj.ahora();
    this.consentimientos.set(
      contactoId,
      acepta
        ? { aceptadoEn: previo.aceptadoEn ?? ahora, rechazadoEn: null }
        : { aceptadoEn: null, rechazadoEn: previo.rechazadoEn ?? ahora },
    );
    return Promise.resolve();
  }

  /** Atajo de preparación: el contacto ya aceptó. */
  aceptar(contactoId: string): this {
    this.consentimientos.set(contactoId, { aceptadoEn: this.reloj.ahora(), rechazadoEn: null });
    return this;
  }

  guardarDatosCapturados(contactoId: string, datos: DatosCapturados): Promise<void> {
    this.guardados.set(contactoId, datos);
    return Promise.resolve();
  }
}
