export type TemperaturaLead = 'frio' | 'tibio' | 'caliente';
export type EstadoLead = 'nuevo' | 'en_atencion' | 'ganado' | 'perdido' | 'descartado';

/** Un lead tal como lo ve el dominio (`MODELO_DATOS.md` §5). El resumen nunca lleva datos personales (R14). */
export interface Lead {
  readonly id: string;
  readonly contactoId: string;
  readonly conversacionId: string | null;
  readonly productoId: string | null;
  readonly temperatura: TemperaturaLead;
  readonly senales: readonly string[];
  readonly resumen: string;
  /** La escala determinista confirmó y se derivó (o, fuera de horario, ya se capturaron los datos). */
  readonly derivado: boolean;
  readonly capturadoFueraHorario: boolean;
  readonly estado: EstadoLead;
  readonly notificadoEn: Date | null;
  readonly recordatorioEn: Date | null;
}

/** Lo que se necesita para crear un lead; el resto sale de los defaults del ciclo (`estado = nuevo`). */
export interface NuevoLead {
  readonly contactoId: string;
  readonly conversacionId: string;
  readonly productoId: string | null;
  readonly temperatura: TemperaturaLead;
  readonly senales: readonly string[];
  readonly resumen: string;
  readonly derivado: boolean;
}

/** Cambios que el caso de uso puede aplicar a un lead abierto. */
export type CambiosLead = Partial<
  Pick<Lead, 'temperatura' | 'senales' | 'resumen' | 'productoId' | 'derivado' | 'capturadoFueraHorario'>
>;

const ORDEN_TEMPERATURA: Readonly<Record<TemperaturaLead, number>> = { frio: 0, tibio: 1, caliente: 2 };

/** La temperatura de un lead solo sube: una propuesta más tibia no enfría a un lead caliente. */
export function temperaturaMasAlta(a: TemperaturaLead, b: TemperaturaLead): TemperaturaLead {
  return ORDEN_TEMPERATURA[a] >= ORDEN_TEMPERATURA[b] ? a : b;
}
