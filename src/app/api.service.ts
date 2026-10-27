import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Customer, Order } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = 'https://delivery-backend-8xrw.onrender.com/api';

  // Customers
  addCustomer(c: Customer) { return this.http.post<Customer>(`${this.base}/customers`, c); }
  getCustomers() { return this.http.get<Customer[]>(`${this.base}/customers`); }
  updateCustomer(id: number, c: Customer) { return this.http.put(`${this.base}/customers/${id}`, c); }
  deleteCustomer(id: number) { return this.http.delete(`${this.base}/customers/${id}`); }
  searchCustomers(keyword: string) { return this.http.get<Customer[]>(`${this.base}/customers/search`, { params: { keyword } }); }
  nearbyCustomers(lat: number, lng: number) { return this.http.get<{ total: number; data: Customer[] }>(`${this.base}/customers/nearby`, { params: { lat, lng } }); }

  // Orders
  mockOrders() { return this.http.post(`${this.base}/orders/mock`, {}); }
  addOrder(customer_id: number, quantity: number) { return this.http.post(`${this.base}/orders`, { customer_id, quantity }); }
  getOrders() { return this.http.get<Order[]>(`${this.base}/orders`); }
  updateOrder(id: number, quantity: number) { return this.http.put(`${this.base}/orders/${id}`, { quantity }); }
  deleteOrder(id: number) { return this.http.delete(`${this.base}/orders/${id}`); }
  clearOrders() { return this.http.delete(`${this.base}/orders/clear-all`); }
  nearbyOrders(lat: number, lng: number) { return this.http.get<{ total: number; data: Order[] }>(`${this.base}/orders/nearby`, { params: { lat, lng } }); }
}
