import type { AdminGroup, NavItem } from './nav';

export interface Visibility {
  can: (p: string) => boolean;
  hasModule: (m: string) => boolean;
}

export function visibleNav(items: NavItem[], v: Visibility): NavItem[] {
  const ok = (i: NavItem) => (!i.perms || i.perms.some(v.can)) && (!i.module || v.hasModule(i.module));
  return items
    .filter(ok)
    .map((i) => (i.children ? { ...i, children: visibleNav(i.children, v) } : i))
    .filter((i) => !i.children || i.children.length > 0);
}

export function visibleAdmin(groups: AdminGroup[], v: Visibility): AdminGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => (!i.perms || i.perms.some(v.can)) && (!i.module || v.hasModule(i.module))) }))
    .filter((g) => g.items.length > 0);
}

export const isActive = (pathname: string, href?: string): boolean => !!href && (href === '/' ? pathname === '/' : pathname === href.split('?')[0] || pathname.startsWith(href.split('?')[0] + '/'));

export function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => (i.children ? flatten(i.children) : [i]));
}
