import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { leerProblema } from '../nucleo/problema';
import { SesionServicio } from '../nucleo/sesion.servicio';

/** CLT4: correo y contraseña. Nada de lo tecleado se guarda en el navegador ni va a la URL. */
@Component({
  selector: 'app-entrar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, InputTextModule, MessageModule],
  template: `
    <main class="entrar">
      <h1>LuxeBoreal</h1>
      <form (submit)="enviar($event)" novalidate>
        <label for="email">Correo</label>
        <input pInputText id="email" name="email" type="email" autocomplete="username"
               [value]="email()" (input)="email.set($any($event.target).value)" />
        <label for="contrasena">Contraseña</label>
        <input pInputText id="contrasena" name="contrasena" type="password" autocomplete="current-password"
               [value]="contrasena()" (input)="contrasena.set($any($event.target).value)" />
        @if (mensaje(); as texto) {
          <p-message severity="error" role="alert">{{ texto }}</p-message>
        }
        <p-button type="submit" label="Entrar" [disabled]="!puedeEnviar()" />
      </form>
    </main>
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
