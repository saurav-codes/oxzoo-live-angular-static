import { Routes } from '@angular/router';
import { CatalogPage } from './catalog';
import { SelftestPage } from './selftest';

export const routes: Routes = [
  { path: '', component: CatalogPage, title: 'angular-static: catalog' },
  { path: 'selftest', component: SelftestPage, title: 'angular-static: self test' },
  { path: '**', redirectTo: '' },
];
