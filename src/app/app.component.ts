import { Component, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

// หน้าที่ไม่ต้องการแถบเมนู
const noNav = (url: string) => {
  const path = url.split(/[?#]/)[0];
  return path === '/' || path.startsWith('/rider');
};

@Component({
  selector: 'app-root', standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html', styleUrl: './app.component.css',
})
export class AppComponent {
  showNav = signal(!noNav(location.pathname));
  constructor() {
    inject(Router).events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e =>
      this.showNav.set(!noNav((e as NavigationEnd).urlAfterRedirects)));
  }
}