export const DEPOT = { lat: 16.2466, lng: 103.2550 };   // ม.มหาสารคาม (ม.ใหม่)
export interface Customer { id?: number; firstname: string; lastname: string; phone: string; lat: number; lng: number; }
export interface Order { id: number; quantity: number; order_date: string; customer_id: number; firstname: string; lastname: string; lat: number; lng: number; }
export interface Stop { name: string; phone: string; lat: number; lng: number; qty: number; eta: string; late: boolean; }
export interface RiderPlan { no: number; name: string; color: string; boxes: number; stops: Stop[]; km: number; minutes: number; backEta: string; }
export interface Plan { depot: { lat: number; lng: number }; riders: RiderPlan[]; createdAt: string; }
export interface RosterRider { id: number; name: string; color: string; active: boolean; }
