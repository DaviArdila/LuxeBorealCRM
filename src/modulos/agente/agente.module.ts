import { Module } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../plataforma/config/index.js';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { GENERADOR_RESPUESTA } from '../conversaciones/index.js';
import {
  BuscarProductos,
  CatalogoModule,
  ConsultarPolitica,
  CotizarEnvio,
  ObtenerFichaProducto,
  ObtenerFotosProducto,
} from '../catalogo/index.js';
import { HorarioModule } from '../horario/index.js';
import { LlmModule } from '../llm/index.js';
import { crearBuscarProducto } from './aplicacion/herramientas/buscar-producto.js';
import { crearConsultarPolitica } from './aplicacion/herramientas/consultar-politica.js';
import { crearCotizarEnvio } from './aplicacion/herramientas/cotizar-envio.js';
import { crearGuardarDatosContacto } from './aplicacion/herramientas/guardar-datos-contacto.js';
import { crearMarcarLeadCaliente } from './aplicacion/herramientas/marcar-lead-caliente.js';
import { crearEnviarFotos } from './aplicacion/herramientas/enviar-fotos.js';
import { crearObtenerFicha } from './aplicacion/herramientas/obtener-ficha.js';
import { ArmarContextoInicial } from './aplicacion/armar-contexto-inicial.js';
import { BucleHerramientas } from './aplicacion/bucle-herramientas.js';
import { EnsamblarPrompt } from './aplicacion/ensamblar-prompt.js';
import { EvaluadorLeadSinEscala } from './aplicacion/evaluador-lead-sin-escala.js';
import { MotorTurno } from './aplicacion/motor-turno.js';
import { ContenidoLlm } from './aplicacion/politicas/contenido-llm.js';
import { PoliticaNoTextuales } from './aplicacion/politicas/politica-no-textuales.js';
import { PoliticaTopeTurnos } from './aplicacion/politicas/politica-tope-turnos.js';
import { RegistroHerramientas } from './aplicacion/registro-herramientas.js';
import { TextoHandoff } from './aplicacion/texto-handoff.js';
import { HERRAMIENTAS_AGENTE, type Herramienta } from './dominio/herramienta.js';
import { POLITICAS_TURNO } from './dominio/politica-turno.js';
import { RepositorioParametroAgentePrisma } from './infraestructura/prisma/repositorio-parametro-agente-prisma.js';
import { RepositorioContactoAgentePrisma } from './infraestructura/prisma/repositorio-contacto-agente-prisma.js';
import { CargadorPrompts } from './infraestructura/prompts/cargador-prompts.js';
import { HistorialRedis } from './infraestructura/redis/historial-redis.js';
import { ContadoresSesionRedis } from './infraestructura/redis/contadores-sesion-redis.js';
import { CONTADORES_SESION, type ContadoresSesion } from './puertos/contadores-sesion.js';
import { EVALUADOR_LEAD, type EvaluadorLead } from './puertos/evaluador-lead.js';
import { HISTORIAL_CONVERSACION } from './puertos/historial-conversacion.js';
import {
  REPOSITORIO_CONTACTO_AGENTE,
  type RepositorioContactoAgente,
} from './puertos/repositorio-contacto-agente.js';
import { REPOSITORIO_PARAMETRO_AGENTE } from './puertos/repositorio-parametro-agente.js';

/** R1: el LLM solo dispone de estas siete herramientas. */
const TOTAL_HERRAMIENTAS = 7;

/**
 * Módulo del agente (Fases 07a y 07b, ADR-0016): implementa el puerto `GENERADOR_RESPUESTA` que define
 * `conversaciones` y lo exporta para que `AppModule` lo componga con
 * `ConversacionesModule.conGenerador(AgenteModule)`. Nunca importa `canales` (regla 13): pide
 * pasos y handoff, y `conversaciones` los ejecuta.
 *
 * El orden de `POLITICAS_TURNO` es el del pipeline (AGT1): mensajes no textuales (R12), tope de
 * turnos (R13) y, al final, `ContenidoLlm` (Fase 07b): el bucle de herramientas sobre `LLM_PORT`. `HorarioModule` aporta `HORARIO` para elegir
 * el texto de handoff (AGT3); el motor aplica el aviso de datos y registra el turno (AGT2, D8).
 */
@Module({
  imports: [PrismaModule, RedisModule, CatalogoModule, HorarioModule, LlmModule],
  providers: [
    { provide: CONTADORES_SESION, useClass: ContadoresSesionRedis },
    { provide: HISTORIAL_CONVERSACION, useClass: HistorialRedis },
    { provide: REPOSITORIO_CONTACTO_AGENTE, useClass: RepositorioContactoAgentePrisma },
    // La Fase 08 reemplaza este binding por la escala determinista (R9-R11).
    { provide: EVALUADOR_LEAD, useClass: EvaluadorLeadSinEscala },
    ArmarContextoInicial,
    { provide: REPOSITORIO_PARAMETRO_AGENTE, useClass: RepositorioParametroAgentePrisma },
    TextoHandoff,
    PoliticaNoTextuales,
    PoliticaTopeTurnos,
    CargadorPrompts,
    EnsamblarPrompt,
    BucleHerramientas,
    ContenidoLlm,
    // R1: exactamente siete herramientas; el arranque falla si falta o sobra alguna.
    {
      provide: HERRAMIENTAS_AGENTE,
      useFactory: (
        buscar: BuscarProductos,
        ficha: ObtenerFichaProducto,
        cotizar: CotizarEnvio,
        politicas: ConsultarPolitica,
        fotos: ObtenerFotosProducto,
        contadores: ContadoresSesion,
        configuracion: Configuracion,
        contactos: RepositorioContactoAgente,
        evaluador: EvaluadorLead,
      ): readonly Herramienta[] => [
        crearBuscarProducto(buscar),
        crearObtenerFicha(ficha),
        crearCotizarEnvio(cotizar),
        crearConsultarPolitica(politicas),
        crearEnviarFotos(fotos, contadores, configuracion),
        crearGuardarDatosContacto(contactos),
        crearMarcarLeadCaliente(evaluador),
      ],
      inject: [
        BuscarProductos,
        ObtenerFichaProducto,
        CotizarEnvio,
        ConsultarPolitica,
        ObtenerFotosProducto,
        CONTADORES_SESION,
        CONFIGURACION,
        REPOSITORIO_CONTACTO_AGENTE,
        EVALUADOR_LEAD,
      ],
    },
    {
      provide: RegistroHerramientas,
      useFactory: (herramientas: readonly Herramienta[]) =>
        new RegistroHerramientas(herramientas, TOTAL_HERRAMIENTAS),
      inject: [HERRAMIENTAS_AGENTE],
    },
    {
      provide: POLITICAS_TURNO,
      useFactory: (
        noTextuales: PoliticaNoTextuales,
        tope: PoliticaTopeTurnos,
        contenido: ContenidoLlm,
      ) => [noTextuales, tope, contenido],
      inject: [PoliticaNoTextuales, PoliticaTopeTurnos, ContenidoLlm],
    },
    { provide: GENERADOR_RESPUESTA, useClass: MotorTurno },
  ],
  exports: [GENERADOR_RESPUESTA],
})
export class AgenteModule {}
