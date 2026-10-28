import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { ApiService } from '../../api.service';
import { PlannerService, COLORS, haversine } from '../../planner.service';
import { Customer, DEPOT } from '../../models';

const MAX_KM = 20;

@Component({
  selector: 'app-customers', standalone: true, imports: [FormsModule, RouterLink],
  templateUrl: './customers.component.html', styleUrl: './customers.component.css',
})
export class CustomersComponent implements OnInit {
  private api = inject(ApiService);
  private planner = inject(PlannerService);

  customers = signal<Customer[]>([]);
  all = signal<Customer[]>([]);
  msg = signal('');
  keyword = '';
  form: Customer = this.empty();
  touched: Record<string, boolean> = {};
  roster = this.planner.roster();
  qty: Record<number, number | null> = {};

  qtyBad(c: Customer) { const v = this.qty[c.id!]; return v != null && (!Number.isInteger(v) || v < 1 || v > 3); }

  async order(c: Customer) {
    if (this.qtyBad(c)) return;
    const q = this.qty[c.id!] ?? 1;

    const res = await Swal.fire({
      title: 'ยืนยันการสั่งอาหาร?',
      text: `ต้องการสั่งอาหารให้คุณ ${c.firstname} ${c.lastname} จำนวน ${q} กล่อง ใช่หรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ยืนยันการสั่ง',
      cancelButtonText: 'ยกเลิก'
    });

    if (!res.isConfirmed) return;

    this.api.addOrder(c.id!, q).subscribe({
      next: () => {
        this.msg.set(`เพิ่มออเดอร์ ${c.firstname} ${q} กล่องแล้ว`);
        this.qty[c.id!] = null;
        Swal.fire({
          title: 'สั่งอาหารสำเร็จ!',
          text: `เพิ่มออเดอร์คุณ ${c.firstname} ${c.lastname} จำนวน ${q} กล่องเรียบร้อยแล้ว`,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
      },
      error: this.err,
    });
  }

  get errs() {
    const f = this.form, num = (v: any) => typeof v === 'number' && !isNaN(v);
    return {
      firstname: !f.firstname?.trim(), lastname: !f.lastname?.trim(),
      phone: !/^\d{10}$/.test(f.phone ?? ''),
      lat: !num(f.lat) || f.lat < -90 || f.lat > 90,
      lng: !num(f.lng) || f.lng < -180 || f.lng > 180,
    };
  }
  get valid() { return !Object.values(this.errs).some(Boolean); }
  get farKm() {
    if (this.errs.lat || this.errs.lng) return 0;
    const d = haversine(DEPOT, this.form);
    return d > MAX_KM ? +d.toFixed(1) : 0;
  }

  ngOnInit() { this.load(); }
  empty(): Customer { return { firstname: '', lastname: '', phone: '', lat: DEPOT.lat, lng: DEPOT.lng }; }
  private err = (e: any) => this.msg.set('ผิดพลาด: ' + (e.error?.error ?? e.message));

  saveRoster() { this.planner.saveRoster(this.roster); }
  addRider() {
    const id = Math.max(0, ...this.roster.map(r => r.id)) + 1;
    this.roster.push({ id, name: `ไรเดอร์ ${id}`, color: COLORS[(id - 1) % COLORS.length], active: true });
    this.saveRoster();
  }
  
  async removeRider(id: number) {
    const res = await Swal.fire({
      title: 'ลบไรเดอร์?',
      text: 'คุณต้องการลบรายชื่อไรเดอร์คนนี้ใช่หรือไม่?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก'
    });
    
    if (!res.isConfirmed) return;

    this.roster = this.roster.filter(r => r.id !== id); 
    this.saveRoster();
    Swal.fire({ title: 'ลบสำเร็จ', icon: 'success', timer: 1000, showConfirmButton: false });
  }

  load() { this.api.getCustomers().subscribe({ next: d => { this.all.set(d); this.customers.set(d); }, error: this.err }); }
  search() {
    const k = this.keyword.trim();
    if (!k) return this.customers.set(this.all());
    if (/^\d+$/.test(k)) this.customers.set(this.all().filter(c => c.phone.includes(k)));
    else this.api.searchCustomers(k).subscribe({ next: d => this.customers.set(d), error: this.err });
  }
  save() {
    if (!this.valid) { ['firstname', 'lastname', 'phone', 'lat', 'lng'].forEach(k => this.touched[k] = true); return; }
    const f = this.form;
    const req = f.id ? this.api.updateCustomer(f.id, f) : this.api.addCustomer(f);
    req.subscribe({ next: () => { this.msg.set('บันทึกข้อมูลแล้ว'); this.reset(); this.load(); }, error: this.err });
  }
  reset() { this.form = this.empty(); this.touched = {}; }
  edit(c: Customer) { this.form = { ...c }; window.scrollTo(0, 0); }
  
  async remove(c: Customer) { 
    const res = await Swal.fire({
      title: 'ลบลูกค้า?',
      text: `คุณต้องการลบข้อมูลลูกค้า "${c.firstname} ${c.lastname}" ใช่หรือไม่?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ลบข้อมูล',
      cancelButtonText: 'ยกเลิก'
    });
    
    if (!res.isConfirmed) return;

    this.api.deleteCustomer(c.id!).subscribe({ 
      next: () => {
        this.load();
        Swal.fire({ title: 'ลบสำเร็จ', icon: 'success', timer: 1000, showConfirmButton: false });
      }, 
      error: this.err 
    }); 
  }
}