import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { ObtenerReferenciaConversacion } from './aplicacion/obtener-referencia-conversacion.js';
import { RepositorioConversacionPrisma } from './infraestructura/prisma/repositorio-conversacion-prisma.js';
import { REPOSITORIO_CONVERSACION } from './puertos/repositorio-conversacion.js';

/**
 * Módulo mínimo que aloja la lectura de referencia de una conversación (D6 de la Fase 08d). Va aparte de
 * `ConversacionesModule`, igual que `ObservadoresHandoffModule`, para que `notificaciones` lo importe sin
 * instanciar colas, canales ni el generador. El repositorio es el mismo adaptador de Prisma, sin estado.
 */
@Module({
  imports: [PrismaModule],
  providers: [{ provide: REPOSITORIO_CONVERSACION, useClass: RepositorioConversacionPrisma }, ObtenerReferenciaConversacion],
  exports: [ObtenerReferenciaConversacion],
})
export class ReferenciaConversacionModule {}
