import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { PlannerService } from '../../planner.service';
import { Plan, RiderPlan, RosterRider } from '../../models';

@Component({
  selector: 'app-rider', standalone: true, imports: [RouterLink],
  templateUrl: './rider.component.html', styleUrl: './rider.component.css',
})
export class RiderComponent {
  private router = inject(Router);
  ps = inject(PlannerService);
  no = Number(inject(ActivatedRoute).snapshot.paramMap.get('no')) || 0;
  roster: RosterRider[] = this.ps.active();
  plan: Plan | null = null;
  rider: RiderPlan | undefined;
  mapUrl = '';

  done = signal<Record<string, string>>(this.ps.getDone());
  msg = signal('');

  get backLink() { return this.no ? '/rider' : '/'; }
  get doneCount() { return this.rider ? this.rider.stops.filter((_, i) => this.doneAt(i)).length : 0; }
  get nextIdx() { return this.rider ? this.rider.stops.findIndex((_, i) => !this.doneAt(i)) : -1; }

  constructor() {
    this.plan = this.ps.decode(location.hash.slice(1)) ?? this.ps.load();
    this.rider = this.plan?.riders.find(r => r.no === this.no);

    if (this.plan && this.rider) {
      const d = `${this.plan.depot.lat},${this.plan.depot.lng}`;
      this.mapUrl = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${d}&destination=${d}` +
        `&waypoints=${this.rider.stops.map(x => x.lat + ',' + x.lng).join('|')}`;
    }
  }

  go(id: number) { this.router.navigate(['/rider', id]); }
  navTo(lat: number, lng: number) { return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${lat},${lng}`; }

  // เพิ่มฟังก์ชันเปิดแผนที่เป็นหน้าต่าง Popup
  openMapPopup(event: Event, url: string) {
    event.preventDefault(); // ป้องกันไม่ให้เปลี่ยนหน้า
    window.open(url, 'MapWindow', 'width=800,height=600,top=100,left=100,resizable=yes,scrollbars=yes');
  }

  private key(i: number) { return this.ps.doneKey(this.plan!, this.no, i); }
  doneAt(i: number): string | undefined { return this.done()[this.key(i)]; }

  async markDone(i: number) {
    const res = await Swal.fire({
      title: 'ยืนยันการส่ง?',
      text: `ส่งสินค้าจุดที่ ${i + 1} เรียบร้อยแล้วใช่หรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก'
    });
    
    if (!res.isConfirmed) return;

    this.ps.setDone(this.key(i), new Date().toISOString());
    this.done.set(this.ps.getDone());
    
    Swal.fire({
      title: 'ส่งสำเร็จ!',
      icon: 'success',
      timer: 1000,
      showConfirmButton: false
    });
  }

  undo(i: number) { this.ps.setDone(this.key(i), null); this.done.set(this.ps.getDone()); }
}