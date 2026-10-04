import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Pantalla provisional: T7 la reemplaza por la edición del estilo (CLT7). */
@Component({
  selector: 'app-estilo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Estilo del bot</h1>',
})
export class EstiloComponent {}
