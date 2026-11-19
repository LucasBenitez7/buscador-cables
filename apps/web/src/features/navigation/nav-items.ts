export type NavItem = {
  href: string;
  label: string;
  /** "exact": only that path. "prefix": that path and everything under it. */
  match: "exact" | "prefix";
  /** Something waiting there for this person (accounts to approve…): shown as a count. */
  badge?: {
    count: number;
    label: string;
    /** Only next to its section: not added to the menu button nor to «Gestión». */
    alone?: boolean;
  };
  /**
   * Where it goes in the header on a computer: the main row, the "Gestión" menu (administration)
   * or the user menu. On a phone they are all in the side panel.
   */
  place?: "main" | "manage" | "user";
};

/** Whether a nav link is the current section, given the current path. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
