import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { leerProblema } from '../nucleo/problema';
import { SesionServicio } from '../nucleo/sesion.servicio';

/** CLT4: correo y contraseña. Nada de lo tecleado se guarda en el navegador ni va a la URL. */
@Component({
  selector: 'app-entrar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, CardModule, FormsModule, InputTextModule, MessageModule, PasswordModule],
  template: `
    <main class="entrar">
      <p-card class="tarjeta">
        <ng-template #title>
          <h1 class="titulo"><i class="pi pi-sparkles" aria-hidden="true"></i> LuxeBoreal</h1>
        </ng-template>
        <form class="formulario" (submit)="enviar($event)" novalidate>
          <div class="campo">
            <label for="email">Correo</label>
            <input pInputText id="email" name="email" type="email" autocomplete="username" [fluid]="true"
                   [value]="email()" (input)="email.set($any($event.target).value)" />
          </div>
          <div class="campo">
            <label for="contrasena">Contraseña</label>
            <p-password inputId="contrasena" [name]="'contrasena'" autocomplete="current-password"
                        [feedback]="false" [toggleMask]="true" [fluid]="true"
                        [ngModel]="contrasena()" (ngModelChange)="contrasena.set($event ?? '')"
                        [ngModelOptions]="{ standalone: true }" />
          </div>
          @if (mensaje(); as texto) {
            <p-message severity="error" role="alert">{{ texto }}</p-message>
          }
          <p-button type="submit" label="Entrar" icon="pi pi-sign-in" [fluid]="true" [disabled]="!puedeEnviar()" />
        </form>
      </p-card>
    </main>
  `,
  styles: `
    .entrar {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .tarjeta {
      width: 100%;
      max-width: 24rem;
    }
    .titulo {
      margin: 0;
      font-size: 1.5rem;
    }
    .formulario {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .campo {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
  `,
})
export class EntrarComponent implements OnDestroy {
  private readonly sesion = inject(SesionServicio);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly contrasena = signal('');
  protected readonly mensaje = signal<string | null>(null);
  protected readonly enviando = signal(false);
  private readonly segundosDeEspera = signal(0);
  private temporizador: ReturnType<typeof setInterval> | undefined;

  protected readonly puedeEnviar = computed(() => !this.enviando() && this.segundosDeEspera() === 0);

  async enviar(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.puedeEnviar() || this.email().trim() === '' || this.contrasena() === '') return;
    this.enviando.set(true);
    this.mensaje.set(null);
    try {
      await this.sesion.iniciar(this.email().trim(), this.contrasena());
      this.contrasena.set('');
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.contrasena.set('');
      const problema = leerProblema(error);
      if (problema.codigo === 'demasiados-intentos') {
        this.esperar(problema.esperarSegundos ?? 60);
      } else if (problema.codigo === 'credenciales-invalidas') {
        this.mensaje.set('Correo o contraseña incorrectos');
      } else {
        this.mensaje.set('No se pudo iniciar sesión. Inténtalo de nuevo en un momento.');
      }
    } finally {
      this.enviando.set(false);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.temporizador);
  }

  private esperar(segundos: number): void {
    const minutos = Math.ceil(segundos / 60);
    this.mensaje.set(
      `Demasiados intentos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} para volver a intentar.`,
    );
    this.segundosDeEspera.set(segundos);
    clearInterval(this.temporizador);
    this.temporizador = setInterval(() => {
      this.segundosDeEspera.update((restantes) => Math.max(0, restantes - 1));
      if (this.segundosDeEspera() === 0) {
        clearInterval(this.temporizador);
        this.mensaje.set(null);
      }
    }, 1000);
  }
}
