import type { DefinicionArea } from '../../nucleo/definicion-area';

export const AREA_CONFIGURACION: DefinicionArea = {
  id: 'configuracion',
  titulo: 'Configuración',
  icono: 'tune',
  roles: ['admin'],
  menu: [
    {
      titulo: 'Configuración',
      icono: 'tune',
      roles: ['admin'],
      hijos: [
        { titulo: 'Horario', ruta: '/configuracion/horario', roles: ['admin'], icono: 'schedule' },
        { titulo: 'Envíos', ruta: '/configuracion/envios', roles: ['admin'], icono: 'local_shipping' },
        { titulo: 'Gasto del LLM', ruta: '/configuracion/gasto-llm', roles: ['admin'], icono: 'savings' },
      ],
    },
  ],
  rutas: () => import('./configuracion.routes').then((modulo) => modulo.CONFIGURACION_ROUTES),
};
