import { Component, OnInit, AfterViewInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import * as L from 'leaflet';
import { ApiService } from '../../api.service';
import { PlannerService, haversine } from '../../planner.service';
import { Customer, Order, Plan, RiderPlan, DEPOT } from '../../models';

@Component({
  selector: 'app-dashboard', standalone: true, imports: [FormsModule, RouterLink],
  templateUrl: './dashboard.component.html', styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  private planner = inject(PlannerService);
  private map!: L.Map;
  private layer = L.layerGroup();
  readonly depot = DEPOT;

  plan = signal<Plan | null>(this.planner.load());
  orders = signal<Order[]>([]);
  customers = signal<Customer[]>([]);
  msg = signal('');
  warn = signal('');
  found = signal<Customer | null>(null);
  private nearLayer = L.layerGroup();
  lat = signal<number | null>(DEPOT.lat);
  lng = signal<number | null>(DEPOT.lng);
  nearMode = signal<'' | 'customers' | 'orders'>('');
  nearCustomers = signal<Customer[]>([]);
  nearOrders = signal<Order[]>([]);
  matches = signal<Customer[]>([]);
  done = signal<Record<string, string>>(this.planner.getDone());
  roster = this.planner.roster();
  phone = '';
  qty: number | null = 1;

  total = computed(() => this.orders().reduce((s, o) => s + o.quantity, 0));
  get activeCount() { return this.roster.filter(r => r.active).length; }
  get capacity() { return this.activeCount * 10; }
  get qtyBad() { const q = this.qty; return q == null || !Number.isInteger(q) || q < 1 || q > 3; }
  /** ออเดอร์เปลี่ยนหลังจัดเส้นทางไปแล้ว */
  get stale() { const p = this.plan(); return !!p && p.riders.reduce((s, r) => s + r.boxes, 0) !== this.total(); }
  /** จุดที่ ETA >= 12:20 (เสี่ยง) หรือเกิน 12:30 (เลท) */
  get riskStops() {
    return (this.plan()?.riders ?? []).flatMap(r => r.stops.filter(s => s.eta >= '12:20').map(s => ({ ...s, rider: r.name })));
  }
  get deliveries() {
    const p = this.plan(), d = this.done();
    if (!p) return [];
    return p.riders.flatMap(r => r.stops.map((s, i) => {
      const iso = d[this.planner.doneKey(p, r.no, i)];
      return { rider: r.name, idx: i + 1, name: s.name, eta: s.eta, iso, late: iso ? !this.planner.onTime(iso) : false };
    }));
  }
  get doneCount() { return this.deliveries.filter(x => x.iso).length; }
  get lateCount() { return this.deliveries.filter(x => x.late).length; }
  hhmm(iso: string) { return this.planner.hhmm(iso); }
  lastEta(r: RiderPlan) { return r.stops.length ? r.stops[r.stops.length - 1].eta : '-'; }

  private fail = (e: any) => this.msg.set('ผิดพลาด: ' + (e.error?.error ?? e.message));

  ngOnInit() { this.importReport(); this.loadAll(); }
  ngAfterViewInit() {
    this.map = L.map('map').setView([this.depot.lat, this.depot.lng], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OpenStreetMap' }).addTo(this.map);
    this.layer.addTo(this.map);
    this.nearLayer.addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => this.setCenter(e.latlng.lat, e.latlng.lng));
    this.refreshMap();
  }
  ngOnDestroy() { this.map?.remove(); }

  loadAll() {
    forkJoin({ o: this.api.getOrders(), c: this.api.getCustomers() }).subscribe({
      next: ({ o, c }) => { this.orders.set(o); this.customers.set(c); this.refreshMap(); },
      error: this.fail,
    });
  }

  // ---------- สั่งด่วน: เบอร์ -> ชื่อ/พิกัด -> จำนวนกล่อง -> เพิ่ม ----------
  /** พิมพ์เบอร์หรือชื่อ -> ขึ้นรายชื่อให้เลือก (เบอร์ครบ 10 หลักและตรงกัน = เลือกให้เลย) */
  onPhone() {
    const k = this.phone.trim().toLowerCase();
    this.found.set(null); this.matches.set([]);
    if (k.length < 2) return;
    const exact = this.customers().find(c => c.phone === k);
    if (exact) return this.found.set(exact);
    this.matches.set(this.customers()
      .filter(c => c.phone.includes(k) || `${c.firstname} ${c.lastname}`.toLowerCase().includes(k))
      .slice(0, 6));
  }
  pick(c: Customer) { this.found.set(c); this.matches.set([]); this.phone = c.phone; }

  addQuick() {
    const c = this.found(), q = this.qty;
    if (!c || this.qtyBad || q == null) return;
    const after = this.total() + q;
    this.warn.set(after > this.capacity ? `คำเตือน: รวม ${after} กล่อง เกินความจุ ${this.capacity} กล่อง (${this.activeCount} คัน x 10)` : '');
    this.api.addOrder(c.id!, q).subscribe({
      next: () => {
        this.msg.set(`เพิ่มออเดอร์ ${c.firstname} ${q} กล่องแล้ว`);
        this.phone = ''; this.found.set(null); this.matches.set([]); this.qty = 1; this.loadAll();
      },
      error: this.fail,
    });
  }
  editOrder(o: Order) {
    const q = Number(prompt('จำนวนกล่อง (1-3)', String(o.quantity)));
    if (!Number.isInteger(q) || q < 1 || q > 3) return this.msg.set('ผิดพลาด: สั่งได้ 1-3 กล่องต่อออเดอร์');
    this.api.updateOrder(o.id, q).subscribe({ next: () => this.loadAll(), error: this.fail });
  }
  removeOrder(o: Order) { this.api.deleteOrder(o.id).subscribe({ next: () => this.loadAll(), error: this.fail }); }

  // ---------- เช็กชื่อไรเดอร์ ----------
  saveRoster() { this.planner.saveRoster(this.roster); }

  // ---------- จัดเส้นทาง ----------
  generate() {
    const act = this.roster.filter(r => r.active);
    if (!act.length) return this.msg.set('ผิดพลาด: ยังไม่มีไรเดอร์ที่มาทำงานวันนี้');
    this.msg.set('กำลังคำนวณ...');
    forkJoin({ orders: this.api.getOrders(), customers: this.api.getCustomers() }).subscribe({
      next: ({ orders, customers }) => {
        this.orders.set(orders); this.customers.set(customers);
        if (!orders.length) return this.msg.set('ยังไม่มีออเดอร์');
        const phones: Record<number, string> = {};
        customers.forEach(c => phones[c.id!] = c.phone);
        const p = this.planner.plan(orders, this.depot, act.length, phones);
        p.riders.forEach((r, i) => {          // ผูกเส้นทางกับไรเดอร์ที่มาทำงานจริง + สีประจำตัว
          const a = act[i];
          r.no = a ? a.id : 900 + i;
          r.name = a ? a.name : `ขาดไรเดอร์ (ต้องเพิ่มอีก ${i + 1 - act.length})`;
          r.color = a ? a.color : '#9e9e9e';
        });
        this.planner.save(p); this.plan.set(p); this.draw(p);
        this.msg.set(p.riders.length > act.length
          ? `คำเตือน: ต้องใช้ ${p.riders.length} คัน แต่มาทำงานแค่ ${act.length} คัน`
          : `จัดแล้ว: ใช้ ${p.riders.length} จาก ${act.length} คัน`);
      },
      error: this.fail,
    });
  }
  mock() { this.api.mockOrders().subscribe({ next: () => { this.msg.set('สร้างข้อมูลจำลองแล้ว'); this.loadAll(); }, error: this.fail }); }
  clear() {
    if (!confirm('ล้างออเดอร์ทั้งหมด?')) return;
    this.api.clearOrders().subscribe({
      next: () => { this.planner.clear(); this.plan.set(null); this.orders.set([]); this.refreshMap(); this.msg.set('ล้างออเดอร์และเส้นทางแล้ว'); },
      error: this.fail,
    });
  }

  // ---------- แจกงาน / รับรายงาน ----------
  link(r: RiderPlan) { return `${location.origin}/rider/${r.no}#${this.planner.encode(this.plan()!, r)}`; }
  copy(r: RiderPlan) {
    navigator.clipboard.writeText(this.link(r)).then(() => this.msg.set(`คัดลอกลิงก์ใบงานของ ${r.name} แล้ว ส่งทาง LINE ได้เลย`));
  }
  refreshDone() { this.done.set(this.planner.getDone()); }
  private importReport() {
    if (!location.hash.startsWith('#r=')) return;
    const d = this.planner.unpack<Record<string, string>>(location.hash.slice(3));
    history.replaceState(null, '', location.pathname);
    if (d) { this.planner.mergeDone(d); this.refreshDone(); this.msg.set(`รับรายงานการส่งแล้ว (${Object.keys(d).length} จุด)`); }
  }

  // ---------- ค้นหาใกล้พิกัด ----------
  private validCenter() {
    const a = this.lat(), b = this.lng();
    return typeof a === 'number' && typeof b === 'number' && !isNaN(a) && !isNaN(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
  }
  dist(p: { lat: number; lng: number }) { return haversine({ lat: this.lat()!, lng: this.lng()! }, p); }
  km(p: { lat: number; lng: number }) { return this.dist(p).toFixed(2); }

  setCenter(lat: number, lng: number) {
    this.lat.set(+lat.toFixed(6)); this.lng.set(+lng.toFixed(6));
    this.nearMode.set(''); this.nearLayer.clearLayers(); this.centerPin([lat, lng]);
  }
  private centerPin(c: L.LatLngExpression) {
    L.circleMarker(c, { radius: 6, color: '#000', fillColor: '#6a1b9a', fillOpacity: 1 }).bindTooltip('จุดค้นหา').addTo(this.nearLayer);
  }
  clearNear() { this.nearMode.set(''); this.nearCustomers.set([]); this.nearOrders.set([]); this.nearLayer.clearLayers(); }

  findCustomers() {   // ลูกค้าในระยะ 1 กม.
    if (!this.validCenter()) return this.msg.set('ผิดพลาด: พิกัดไม่ถูกต้อง');
    this.api.nearbyCustomers(this.lat()!, this.lng()!).subscribe({
      next: r => {
        this.nearCustomers.set([...r.data].sort((a, b) => this.dist(a) - this.dist(b)));
        this.nearMode.set('customers'); this.drawNear(1);
      },
      error: this.fail,
    });
  }
  findOrders() {      // ออเดอร์ในระยะ 2 กม.
    if (!this.validCenter()) return this.msg.set('ผิดพลาด: พิกัดไม่ถูกต้อง');
    this.api.nearbyOrders(this.lat()!, this.lng()!).subscribe({
      next: r => {
        this.nearOrders.set([...r.data].sort((a, b) => this.dist(a) - this.dist(b)));
        this.nearMode.set('orders'); this.drawNear(2);
      },
      error: this.fail,
    });
  }
  private drawNear(km: number) {
    this.nearLayer.clearLayers();
    const c: L.LatLngExpression = [this.lat()!, this.lng()!];
    const circle = L.circle(c, { radius: km * 1000, color: '#6a1b9a', weight: 2, fillOpacity: 0.08 }).addTo(this.nearLayer);
    this.centerPin(c);
    const rows = this.nearMode() === 'customers'
      ? this.nearCustomers().map(x => ({ lat: x.lat, lng: x.lng, text: `${x.firstname} ${x.lastname} (${x.phone})` }))
      : this.nearOrders().map(x => ({ lat: x.lat, lng: x.lng, text: `${x.firstname} (${x.quantity} กล่อง)` }));
    rows.forEach(r => L.circleMarker([r.lat, r.lng], { radius: 8, color: '#6a1b9a', fillColor: '#ce93d8', fillOpacity: 1 })
      .bindPopup(r.text).addTo(this.nearLayer));
    this.map.fitBounds(circle.getBounds(), { padding: [20, 20] });
  }

  // ---------- แผนที่ ----------
  private refreshMap() {
    if (!this.map) return;
    const p = this.plan();
    if (p) this.draw(p); else this.drawPins();
  }
  private drawDepot() {
    L.circleMarker([this.depot.lat, this.depot.lng], { radius: 10, color: '#000', fillColor: '#ffeb3b', fillOpacity: 1 })
      .bindTooltip('ร้าน').addTo(this.layer);
  }
  /** ยังไม่จัดเส้นทาง: ปักหมุดร้าน + บ้านลูกค้าที่สั่งวันนี้ */
  private drawPins() {
    this.layer.clearLayers(); this.drawDepot();
    const pts: L.LatLngExpression[] = [[this.depot.lat, this.depot.lng]];
    for (const o of this.orders()) {
      L.circleMarker([o.lat, o.lng], { radius: 7, color: '#455a64', fillColor: '#90a4ae', fillOpacity: 1 })
        .bindPopup(`${o.firstname} ${o.lastname} (${o.quantity} กล่อง)`).addTo(this.layer);
      pts.push([o.lat, o.lng]);
    }
    if (pts.length > 1) this.map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    else this.map.setView([this.depot.lat, this.depot.lng], 13);
  }
  private draw(p: Plan) {
    this.layer.clearLayers(); this.drawDepot();
    const bounds: L.LatLngExpression[] = [[p.depot.lat, p.depot.lng]];
    for (const r of p.riders) {
      const line: L.LatLngExpression[] = [[p.depot.lat, p.depot.lng], ...r.stops.map(s => [s.lat, s.lng] as L.LatLngExpression), [p.depot.lat, p.depot.lng]];
      L.polyline(line, { color: r.color, weight: 4 }).addTo(this.layer);
      r.stops.forEach((s, i) => {
        L.circleMarker([s.lat, s.lng], { radius: 9, color: r.color, fillColor: s.late ? '#ffcdd2' : '#fff', fillOpacity: 1 })
          .bindTooltip(`${i + 1}`, { permanent: true, direction: 'center', className: 'num' })
          .bindPopup(`${r.name} จุด ${i + 1}: ${s.name} (${s.qty} กล่อง) ถึง ${s.eta}`).addTo(this.layer);
        bounds.push([s.lat, s.lng]);
      });
    }
    this.map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
  }
}