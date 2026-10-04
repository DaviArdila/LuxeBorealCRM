import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Marco de la app. T6 le agrega la barra con el usuario y el menú armado desde el registro y el rol. */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<main><router-outlet /></main>',
})
export class ShellComponent {}
