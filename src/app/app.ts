import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `<main>
    <nav><a routerLink="/">Catalog</a><a routerLink="/selftest">Self test</a><a href="/_zoo/health.json">Health</a></nav>
    <router-outlet />
  </main>`,
})
export class App {}
