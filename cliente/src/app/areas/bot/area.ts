import type { DefinicionArea } from '../../nucleo/definicion-area';

export const AREA_BOT: DefinicionArea = {
  id: 'bot',
  titulo: 'Bot',
  icono: 'forum',
  roles: ['admin'],
  menu: [
    {
      titulo: 'Bot',
      icono: 'forum',
      roles: ['admin'],
      hijos: [
        { titulo: 'Estilo del bot', ruta: '/bot/estilo', roles: ['admin'], icono: 'edit_note' },
        { titulo: 'Mensajes fijos', ruta: '/bot/mensajes-fijos', roles: ['admin'], icono: 'chat' },
      ],
    },
  ],
  rutas: () => import('./bot.routes').then((modulo) => modulo.BOT_ROUTES),
};
