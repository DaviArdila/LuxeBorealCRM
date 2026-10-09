import { Module } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../plataforma/config/index.js';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RedisModule } from '../../plataforma/redis/index.js';
import { AsistenteModule, CONSULTA_CASOS, type ConsultaCasos } from '../asistente/index.js';
import { AvisoAsesorModule, GENERADOR_RESPUESTA } from '../conversaciones/index.js';
import {
  BuscarProductos,
  CatalogoModule,
  CotizarEnvio,
  ObtenerFichaProducto,
  ObtenerFotosProducto,
} from '../catalogo/index.js';
import { HorarioModule } from '../horario/index.js';
import { LeadsModule } from '../leads/index.js';
import { LlmModule } from '../llm/index.js';
import { crearBuscarProducto } from './aplicacion/herramientas/buscar-producto.js';
import { crearConsultarCaso } from './aplicacion/herramientas/consultar-caso.js';
import { crearCotizarEnvio } from './aplicacion/herramientas/cotizar-envio.js';
import { crearDerivarAAsesor } from './aplicacion/herramientas/derivar-a-asesor.js';
import { crearGuardarDatosContacto } from './aplicacion/herramientas/guardar-datos-contacto.js';
import { crearMarcarLeadCaliente } from './aplicacion/herramientas/marcar-lead-caliente.js';
import { protegerEscrituras } from './aplicacion/herramientas/con-consentimiento.js';
import { crearRegistrarConsentimiento } from './aplicacion/herramientas/registrar-consentimiento.js';
import { crearEnviarFotos } from './aplicacion/herramientas/enviar-fotos.js';
import { crearObtenerFicha } from './aplicacion/herramientas/obtener-ficha.js';
import { ArmarContextoInicial } from './aplicacion/armar-contexto-inicial.js';
import { BucleHerramientas } from './aplicacion/bucle-herramientas.js';
import { EnsamblarPrompt } from './aplicacion/ensamblar-prompt.js';
import { EstiloModule } from './estilo.module.js';
import { MotorTurno } from './aplicacion/motor-turno.js';
import { ContenidoLlm } from './aplicacion/politicas/contenido-llm.js';
import { PoliticaNoTextuales } from './aplicacion/politicas/politica-no-textuales.js';
import { PoliticaPidePersona } from './aplicacion/politicas/politica-pide-persona.js';
import { PoliticaTopeTurnos } from './aplicacion/politicas/politica-tope-turnos.js';
import { RegistroHerramientas } from './aplicacion/registro-herramientas.js';
import { HERRAMIENTAS_AGENTE, type Herramienta } from './dominio/herramienta.js';
import { POLITICAS_TURNO } from './dominio/politica-turno.js';
import { CapturaLeadDeLeads } from './infraestructura/leads/captura-lead-de-leads.js';
import { EvaluadorLeadDeLeads } from './infraestructura/leads/evaluador-lead-de-leads.js';
import { RepositorioContactoAgentePrisma } from './infraestructura/prisma/repositorio-contacto-agente-prisma.js';
import { HistorialRedis } from './infraestructura/redis/historial-redis.js';
import { ContadoresSesionRedis } from './infraestructura/redis/contadores-sesion-redis.js';
import { CONTADORES_SESION, type ContadoresSesion } from './puertos/contadores-sesion.js';
import { CAPTURA_LEAD, type CapturaLead } from './puertos/captura-lead.js';
import { EVALUADOR_LEAD, type EvaluadorLead } from './puertos/evaluador-lead.js';
import { HISTORIAL_CONVERSACION } from './puertos/historial-conversacion.js';
import {
  REPOSITORIO_CONTACTO_AGENTE,
  type RepositorioContactoAgente,
} from './puertos/repositorio-contacto-agente.js';

/** R1: el LLM solo dispone de estas nueve herramientas. */
const TOTAL_HERRAMIENTAS = 9;

/**
 * Módulo del agente (Fases 07a y 07b, ADR-0016): implementa el puerto `GENERADOR_RESPUESTA` que define
 * `conversaciones` y lo exporta para que `AppModule` lo componga con
 * `ConversacionesModule.conGenerador(AgenteModule)`. Nunca importa `canales` (regla 13): pide
 * pasos y handoff, y `conversaciones` los ejecuta.
 *
 * El orden de `POLITICAS_TURNO` es el del pipeline (AGT1): mensajes no textuales (R12), tope de
 * turnos (R13), petición de persona (Fase 08, R9) y, al final, `ContenidoLlm` (Fase 07b): el bucle de herramientas sobre `LLM_PORT`.
 * `HorarioModule` aporta `HORARIO` al prompt; `AvisoAsesorModule` aporta la lectura `ASESOR_AVISADO` (CNV15, AGT28). El
 * motor aplica el aviso de datos, suma el aviso al asesor que pidió una política y registra el turno (AGT2, D8, D2 de la 12d).
 */
@Module({
  // Fase 08c: `EstiloModule` aporta `CargadorPrompts` y el estilo editable (`ProveedorEstilo`).
  imports: [PrismaModule, RedisModule, AsistenteModule, CatalogoModule, HorarioModule, LeadsModule, LlmModule, EstiloModule, AvisoAsesorModule],
  providers: [
    { provide: CONTADORES_SESION, useClass: ContadoresSesionRedis },
    { provide: HISTORIAL_CONVERSACION, useClass: HistorialRedis },
    { provide: REPOSITORIO_CONTACTO_AGENTE, useClass: RepositorioContactoAgentePrisma },
    // Fase 08: la escala determinista y el guardado del lead viven en `leads` (R9).
    { provide: EVALUADOR_LEAD, useClass: EvaluadorLeadDeLeads },
    { provide: CAPTURA_LEAD, useClass: CapturaLeadDeLeads },
    ArmarContextoInicial,
    PoliticaNoTextuales,
    PoliticaTopeTurnos,
    PoliticaPidePersona,
    EnsamblarPrompt,
    BucleHerramientas,
    ContenidoLlm,
    // R1: exactamente nueve herramientas; las que escriben datos del cliente pasan por la puerta de consentimiento (AGT26); el arranque falla si falta o sobra alguna.
    {
      provide: HERRAMIENTAS_AGENTE,
      useFactory: (
        buscar: BuscarProductos,
        ficha: ObtenerFichaProducto,
        cotizar: CotizarEnvio,
        casos: ConsultaCasos,
        fotos: ObtenerFotosProducto,
        contadores: ContadoresSesion,
        configuracion: Configuracion,
        contactos: RepositorioContactoAgente,
        evaluador: EvaluadorLead,
        captura: CapturaLead,
      ): readonly Herramienta[] =>
        protegerEscrituras(
          [
            crearBuscarProducto(buscar),
            crearObtenerFicha(ficha),
            crearCotizarEnvio(cotizar),
            crearConsultarCaso(casos),
            crearEnviarFotos(fotos, contadores, configuracion),
            crearGuardarDatosContacto(contactos, captura),
            crearMarcarLeadCaliente(evaluador),
            crearDerivarAAsesor(),
            crearRegistrarConsentimiento(contactos),
          ],
          contactos,
        ),
      inject: [
        BuscarProductos,
        ObtenerFichaProducto,
        CotizarEnvio,
        CONSULTA_CASOS,
        ObtenerFotosProducto,
        CONTADORES_SESION,
        CONFIGURACION,
        REPOSITORIO_CONTACTO_AGENTE,
        EVALUADOR_LEAD,
        CAPTURA_LEAD,
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
        pidePersona: PoliticaPidePersona,
        contenido: ContenidoLlm,
      ) => [noTextuales, tope, pidePersona, contenido],
      inject: [PoliticaNoTextuales, PoliticaTopeTurnos, PoliticaPidePersona, ContenidoLlm],
    },
    { provide: GENERADOR_RESPUESTA, useClass: MotorTurno },
  ],
  exports: [GENERADOR_RESPUESTA],
})
export class AgenteModule {}
