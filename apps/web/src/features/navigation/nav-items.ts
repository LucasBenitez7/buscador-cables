export type NavItem = {
  href: string;
  label: string;
  /** "exact": only that path. "prefix": that path and everything under it. */
  match: "exact" | "prefix";
};

/** Whether a nav link is the current section, given the current path. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
