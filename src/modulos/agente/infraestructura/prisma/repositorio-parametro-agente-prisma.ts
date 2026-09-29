import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type { ClaveTextoAgente, RepositorioParametroAgente } from '../../puertos/repositorio-parametro-agente.js';

/**
 * Único lugar con los textos de respaldo del agente (AGT3, P31): los del prototipo
 * (`ChatLuxeCRM/prisma/seedCatalogo.ts` y `docs/plantilla-catalogo/parametros.csv`), sin el nombre
 * de la asesora, que es dato del negocio. El negocio los reemplaza en `parametro` sin desplegar (R15).
 */
const TEXTOS_DE_RESPALDO: Readonly<Record<ClaveTextoAgente, string>> = {
  mensaje_pedir_texto_audio: 'Por acá no puedo escuchar audios todavía, ¿me lo escribes en texto porfa?',
  mensaje_imagen_no_procesada:
    'No puedo ver la imagen todavía — ¿me cuentas en texto qué producto buscas, o me das el SKU?',
  aviso_datos: 'Soy un asistente automatizado. Tus datos se usan solo para gestionar tu pedido.',
  mensaje_handoff: 'Te paso con un asesor para cerrar los detalles — te escribe en un momento.',
  mensaje_handoff_fuera_horario:
    'En este momento no hay un asesor disponible; apenas abramos te escribimos para cerrar los detalles.',
};

/**
 * Adaptador Prisma de {@link RepositorioParametroAgente} sobre `parametro` (D9). Una clave ausente, en
 * blanco o con un valor que no es texto nunca lanza: cae al respaldo, como los repositorios de
 * `conversaciones` y `llm`.
 */
@Injectable()
export class RepositorioParametroAgentePrisma implements RepositorioParametroAgente {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerTexto(clave: ClaveTextoAgente): Promise<string> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave } });
    const valor = fila?.valor;
    return typeof valor === 'string' && valor.trim().length > 0 ? valor : TEXTOS_DE_RESPALDO[clave];
  }
}
