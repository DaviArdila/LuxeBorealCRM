# Cliente: rediseño de estilos, shell y grillas

Rama: `feat/cliente-estilos` (trabajo fuera de fase, solo ODD). Alcance: solo `cliente/`.
La filosofía de estilos y el ADR se documentan **al final**, con lo que el usuario valide (T7).

## Objetivo
Aprovechar el espacio del back office: riel lateral que se expande al pasar el mouse, logo en el menú sin
barra superior, avisos que se pliegan a un icono, grillas de tarjetas con ventanas para ver/editar,
controles ~10 % más compactos.

## Tareas
- [x] T1 Tokens `--luxe-*` y densidad -10 % de filtros/botones (`cliente/src/styles.scss`) (ae1258e)
- [x] T2 Shell: riel fijo 4.5rem con expansión superpuesta al hover/foco; logo al menú; sin barra superior en escritorio; sin botón «Compactar menú»; `.pagina` más ancha (e655ae9)
- [x] T3 Compartidos: `app-cabecera-pagina`, `app-rejilla`, `app-tarjeta-elemento`, `app-aviso` modo flotante plegable (09a62d8)
- [x] T4 Casos de uso: grilla de categorías → ventana de casos → ventana de lectura → edición; filtros compactos (4a2c249)
- [x] T5 Estilo del bot: buscador, grilla de secciones, arrastrar para reordenar, historial en ventana, aviso de tope flotante (519c3f6)
- [x] T6 Configuración (horario, envíos, gasto LLM) e Inicio con cabecera y grilla (affb14f)
- [ ] T7 (tras visto bueno) documentar la filosofía + ADR propuesta

Ronda 2 (correcciones tras la revisión visual del usuario):
- [ ] T8 Riel plegado sin íconos y con barra horizontal: causa raíz y arreglo; spec del pliegue
- [ ] T9 Cabecera unificada: fuente Manrope (`--luxe-fuente-titulo`), un solo botón «Ayuda y avisos» con insignia; los avisos flotantes aparecen como mensaje breve y se pliegan dentro de ese botón
- [ ] T10 Controles compactos (~15 %): `.luxe-filtros` con densidad -3; «Nuevo caso», «Nueva sección», «Categorías» e «Historial» como botones de ícono con globo y `aria-label`
- [ ] T11 Tarjetas unificadas (título propio, fila de acciones, acento por tipo, interruptor mini) y arreglo del contorno recortado dentro de las ventanas
- [ ] T12 Estilo: buscador bajo el título y ventana de lectura antes de editar; Casos: arrastrar categorías para reordenarlas

## Verificación
`npm --prefix cliente run ci`; recorrido manual con `npm start`.

## Progreso
Ruta: un escritor delegado (más de 2 archivos no triviales). El hash de cada tarea se anota junto a su casilla.
- T1: CSS puro, sin RED posible; verificado con `npm run build` y `npm run lint` (densidad -1 y tokens `--luxe-*`).
