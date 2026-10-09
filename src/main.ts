import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { App } from './app/app';
import { routes } from './app/routes';

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection(), provideRouter(routes)],
}).catch((err) => console.error(err));
