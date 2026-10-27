
import { Injectable } from '@angular/core';
import { Order, Plan, RiderPlan, RosterRider, Stop } from './models';


type Pt = { lat: number; lng: number };
export const COLORS = ['#e53935', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa', '#00acc1', '#6d4c41', '#d81b60', '#3949ab', '#7cb342'];
const CAPACITY = 10, SPEED_KMH = 30, STOP_MIN = 3;

export function haversine(a: Pt, b: Pt): number {
  const R = 6371, r = (d: number) => d * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

@Injectable({ providedIn: 'root' })
export class PlannerService {
  // ---------- เก็บแผน ----------
  save(p: Plan) { localStorage.setItem('plan', JSON.stringify(p)); }
  load(): Plan | null { const s = localStorage.getItem('plan'); return s ? JSON.parse(s) : null; }
  clear() { localStorage.removeItem('plan'); }

  // ---------- รายชื่อไรเดอร์ (เช็กชื่อมาทำงาน) ----------
roster(): RosterRider[] {
  let r: RosterRider[] = [];
  try { const x = JSON.parse(localStorage.getItem('roster') ?? 'null'); if (Array.isArray(x)) r = x; } catch { }
  if (!r.length) r = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `ไรเดอร์ ${i + 1}`, color: '', active: true }));
  return r.map((x, i) => ({ ...x, color: x.color || COLORS[i % COLORS.length] }));
}
  saveRoster(r: RosterRider[]) { localStorage.setItem('roster', JSON.stringify(r)); }
  active(): RosterRider[] { return this.roster().filter(r => r.active); }

  // ---------- ลิงก์ส่งงานให้ไรเดอร์ (ไม่ต้องมี backend: ข้อมูลอยู่ใน #hash) ----------
  pack(o: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    let s = ''; bytes.forEach(b => s += String.fromCharCode(b));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  unpack<T>(h: string): T | null {
    try {
      const b = atob(h.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))));
    } catch { return null; }
  }
  encode(plan: Plan, r: RiderPlan): string { return this.pack({ ...plan, riders: [r] }); }
  decode(h: string): Plan | null { return this.unpack<Plan>(h); }

  /** รวมออเดอร์ลูกค้าคนเดียวกัน -> แตกจุดที่เกิน 10 กล่อง -> แบ่งกลุ่มตามมุม (sweep) ไม่เกิน 10 กล่อง/คัน -> NN + 2-opt */
  plan(orders: Order[], depot: Pt, riderCount: number, phones: Record<number, string> = {},
    startMin = 11 * 60 + 30, deadlineMin = 12 * 60 + 30): Plan {
    const m = new Map<number, { name: string; phone: string; lat: number; lng: number; qty: number }>();
    for (const o of orders) {
      const c = m.get(o.customer_id) ?? { name: `${o.firstname} ${o.lastname}`, phone: phones[o.customer_id] ?? '', lat: o.lat, lng: o.lng, qty: 0 };
      c.qty += o.quantity; m.set(o.customer_id, c);
    }
    const pts = [...m.values()].flatMap(c => {
      const parts: typeof c[] = []; let left = c.qty;
      while (left > 0) { const q = Math.min(left, CAPACITY); parts.push({ ...c, qty: q }); left -= q; }
      return parts;
    }).sort((a, b) => Math.atan2(a.lng - depot.lng, a.lat - depot.lat) - Math.atan2(b.lng - depot.lng, b.lat - depot.lat));

    const total = pts.reduce((s, p) => s + p.qty, 0);
    const k = Math.max(riderCount, Math.ceil(total / CAPACITY), 1);
    const target = total / k;
    const groups: typeof pts[] = [[]]; let cur = 0;
    for (const p of pts) {
      if (cur + p.qty > CAPACITY || (cur >= target && groups.length < k && cur > 0)) { groups.push([]); cur = 0; }
      groups[groups.length - 1].push(p); cur += p.qty;
    }

    const riders: RiderPlan[] = groups.filter(g => g.length).map((g, i) => {
      const route = this.twoOpt(depot, this.nearest(depot, g));
      let t = startMin, km = 0, prev: Pt = depot;
      const stops: Stop[] = route.map(p => {
        const d = haversine(prev, p); km += d; t += d / SPEED_KMH * 60 + STOP_MIN; prev = p;
        return { name: p.name, phone: p.phone, lat: p.lat, lng: p.lng, qty: p.qty, eta: fmt(t), late: t > deadlineMin };
      });
      const back = haversine(prev, depot); km += back;
      return {
        no: i + 1, name: `ไรเดอร์ ${i + 1}`, color: COLORS[i % COLORS.length], boxes: g.reduce((s, p) => s + p.qty, 0), stops,
        km: +km.toFixed(2), minutes: Math.round(t + back / SPEED_KMH * 60 - startMin), backEta: fmt(t + back / SPEED_KMH * 60)
      };
    });
    return { depot, riders, createdAt: new Date().toISOString() };
  }

  private nearest<T extends Pt>(start: Pt, list: T[]): T[] {
    const left = [...list], out: T[] = []; let cur = start;
    while (left.length) {
      let bi = 0; left.forEach((p, i) => { if (haversine(cur, p) < haversine(cur, left[bi])) bi = i; });
      cur = left[bi]; out.push(left.splice(bi, 1)[0]);
    }
    return out;
  }
  private twoOpt<T extends Pt>(depot: Pt, r: T[]): T[] {
    const len = (x: T[]) => [depot, ...x, depot].reduce((s, p, i, a) => i ? s + haversine(a[i - 1], p) : 0, 0);
    let best = r, improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < best.length - 1; i++) for (let j = i + 1; j < best.length; j++) {
        const c = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        if (len(c) < len(best) - 1e-9) { best = c; improved = true; }
      }
    }
    return best;
  }

  // ---------- เวลาส่งจริง ----------
  doneKey(p: Plan, no: number, i: number) { return `${p.createdAt}|${no}|${i}`; }
  getDone(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem('done') ?? '{}'); } catch { return {}; }
  }
  setDone(key: string, iso: string | null) {
    const d = this.getDone();
    if (iso) d[key] = iso; else delete d[key];
    localStorage.setItem('done', JSON.stringify(d));
  }
  mergeDone(d: Record<string, string>) { localStorage.setItem('done', JSON.stringify({ ...this.getDone(), ...d })); }
  hhmm(iso: string) { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  onTime(iso: string) { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() <= 12 * 60 + 30; }
}
