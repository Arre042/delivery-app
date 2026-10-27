import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { CustomersComponent } from './pages/customers/customers.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { RiderComponent } from './pages/rider/rider.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'customers', component: CustomersComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'rider', component: RiderComponent },
  { path: 'rider/:no', component: RiderComponent },
  { path: '**', redirectTo: '' },
];