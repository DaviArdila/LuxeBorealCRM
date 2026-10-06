import type { DefinicionArea } from '../../nucleo/definicion-area';

export const AREA_ASISTENTE: DefinicionArea = {
  id: 'asistente',
  titulo: 'Asistente',
  icono: 'forum',
  roles: ['admin'],
  menu: [
    {
      titulo: 'Asistente',
      icono: 'forum',
      roles: ['admin'],
      hijos: [
        { titulo: 'Casos de uso', ruta: '/asistente/casos', roles: ['admin'], icono: 'rule' },
        { titulo: 'Estilo del bot', ruta: '/asistente/estilo', roles: ['admin'], icono: 'edit_note' },
      ],
    },
  ],
  rutas: () => import('./asistente.routes').then((modulo) => modulo.ASISTENTE_ROUTES),
};
