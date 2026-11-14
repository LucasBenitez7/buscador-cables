import Link from "next/link";
import type { ReactNode } from "react";
import {
  CABLE_ACTION_LABELS,
  CONNECTION_STATUSES,
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUSES,
  INSTALLATION_STATUS_LABELS,
  ROLES,
  ROLE_LABELS,
} from "@cables/shared";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CODE_LINK, TEXT_LINK_SM } from "@/components/ui/text-link";
import {
  CONNECTION_VARIANT,
  INSTALLATION_VARIANT,
} from "@/features/cables/components/cable-status-badges";
import { HealthCard } from "@/features/system/components/health-card";
import type { ActivityEntry } from "@/server/activity/service";
import type { CableProgress, Dashboard as DashboardData } from "@/server/dashboard/service";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

const count = (value: number) => value.toLocaleString("es-ES");
const percent = (value: number, total: number) =>
  total === 0 ? 0 : Math.round((value * 100) / total);

/**
 * The home page. It only renders the sections the server filled in for this role (see
 * `getDashboard`): what a role may not see never reaches the browser.
 */
export function Dashboard({ data }: { data: DashboardData }) {
  const { progress, myActivity, team, admin } = data;

  // Columna lateral: lo más útil para cada rol junto al avance de la obra.
  const side = admin ? (
    <AdminPanel admin={admin} />
  ) : myActivity ? (
    <ActivityPanel
      title="Tu actividad reciente"
      entries={myActivity}
      href="/activity/me"
      empty="Todavía no has registrado ningún movimiento."
      showUser={false}
    />
  ) : (
    <Shortcuts />
  );

  return (
    <div className="space-y-6">
      <QuickSearch />

      {admin && admin.pendingAccounts > 0 ? (
        <div
          role="status"
          className="border-warning/40 bg-warning/10 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
        >
          <p>
            <span className="text-warning font-semibold">
              {admin.pendingAccounts}{" "}
              {admin.pendingAccounts === 1 ? "cuenta pendiente" : "cuentas pendientes"}
            </span>{" "}
            de aprobar. No pueden entrar hasta que las apruebes.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/users">Revisar cuentas</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProgressPanel progress={progress} />
        </div>
        {side}
      </div>

      {team ? <StatusPanel progress={progress} trays={team.trays} /> : null}

      {team ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ActivityPanel
            title="Actividad del equipo"
            entries={team.recentActivity}
            href="/activity"
            empty="Todavía no hay movimientos."
          />
          {admin && myActivity ? (
            <ActivityPanel
              title="Tu actividad reciente"
              entries={myActivity}
              href="/activity/me"
              empty="Todavía no has registrado ningún movimiento."
              showUser={false}
            />
          ) : (
            <Shortcuts />
          )}
        </div>
      ) : null}
    </div>
  );
}

function Panel({
  title,
  href,
  linkLabel = "Ver todo",
  className,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("bg-card space-y-4 rounded-lg border p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {href ? (
          <Link href={href} className={TEXT_LINK_SM}>
            {linkLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Two plain GET forms: the search pages already read `?q=`. */
function QuickSearch() {
  return (
    <section aria-label="Búsqueda rápida" className="grid gap-3 md:grid-cols-2">
      <SearchBox
        action="/cables"
        id="home-cable"
        label="Buscar un cable"
        placeholder="Código, equipo o descripción"
      />
      <SearchBox
        action="/trays"
        id="home-tray"
        label="Buscar una bandeja"
        placeholder="99UXA00L22036…"
        code
      />
    </section>
  );
}

function SearchBox({
  action,
  id,
  label,
  placeholder,
  code,
}: {
  action: string;
  id: string;
  label: string;
  placeholder: string;
  code?: boolean;
}) {
  return (
    <form
      action={action}
      role="search"
      aria-label={label}
      className="bg-card space-y-2 rounded-lg border p-4"
    >
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          name="q"
          type="search"
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cn("min-w-0 flex-1", code && "font-mono uppercase")}
        />
        <Button type="submit">Buscar</Button>
      </div>
    </form>
  );
}

function ProgressPanel({ progress }: { progress: CableProgress }) {
  const { total, laid, connected, installation } = progress;
  return (
    <Panel title="Avance de la obra" href="/cables" linkLabel="Ver cables" className="h-full">
      <p className="text-muted-foreground text-sm">
        <span className="text-foreground text-3xl font-semibold tabular-nums">{count(total)}</span>{" "}
        cables en el proyecto
      </p>
      <Meter label="Tendidos" value={laid} total={total} barClassName="bg-primary" />
      <Meter label="Conectados" value={connected} total={total} barClassName="bg-success" />
      {installation.PARTIALLY_LAID > 0 ? (
        <p className="text-sm">
          <Link href="/cables?loose=1" className="text-warning underline-offset-4 hover:underline">
            {count(installation.PARTIALLY_LAID)}{" "}
            {installation.PARTIALLY_LAID === 1
              ? "cable tendido a medias, con la punta suelta"
              : "cables tendidos a medias, con la punta suelta"}
          </Link>
        </p>
      ) : null}
    </Panel>
  );
}

function Meter({
  label,
  value,
  total,
  barClassName,
}: {
  label: string;
  value: number;
  total: number;
  barClassName: string;
}) {
  const pct = percent(value, total);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          <span className="text-foreground font-semibold tabular-nums">{pct} %</span> ·{" "}
          {count(value)} de {count(total)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="bg-muted h-2.5 overflow-hidden rounded-full"
      >
        <div className={cn("h-full rounded-full", barClassName)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Every status with its count; each row opens the search filtered by it. */
function StatusPanel({ progress, trays }: { progress: CableProgress; trays: number }) {
  return (
    <Panel title="Estado de los cables">
      <div className="grid gap-6 md:grid-cols-2">
        <StatusList
          title="Instalación"
          rows={INSTALLATION_STATUSES.map((status) => ({
            key: status,
            label: INSTALLATION_STATUS_LABELS[status],
            variant: INSTALLATION_VARIANT[status],
            value: progress.installation[status],
            href: `/cables?installation=${status}`,
          }))}
          total={progress.total}
        />
        <StatusList
          title="Conexión"
          rows={CONNECTION_STATUSES.map((status) => ({
            key: status,
            label: CONNECTION_STATUS_LABELS[status],
            variant: CONNECTION_VARIANT[status],
            value: progress.connection[status],
            href: `/cables?connection=${status}`,
          }))}
          total={progress.total}
        />
      </div>
      <p className="text-muted-foreground border-t pt-3 text-sm">
        <Link href="/trays" className={TEXT_LINK_SM}>
          {count(trays)} bandejas
        </Link>{" "}
        cargadas de los planos.
      </p>
    </Panel>
  );
}

function StatusList({
  title,
  rows,
  total,
}: {
  title: string;
  rows: {
    key: string;
    label: string;
    variant: (typeof INSTALLATION_VARIANT)[keyof typeof INSTALLATION_VARIANT];
    value: number;
    href: string;
  }[];
  total: number;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={row.href}
              className="hover:bg-muted/60 focus-visible:ring-ring/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3"
            >
              <Badge dot variant={row.variant} className="w-32 shrink-0">
                {row.label}
              </Badge>
              <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden>
                <span
                  className="bg-muted-foreground/60 block h-full rounded-full"
                  style={{ width: `${percent(row.value, total)}%` }}
                />
              </span>
              <span
                className={cn(
                  "w-14 text-right font-semibold tabular-nums",
                  row.value === 0 && "text-muted-foreground/60 font-normal",
                )}
              >
                {count(row.value)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityPanel({
  title,
  entries,
  href,
  empty,
  showUser = true,
}: {
  title: string;
  entries: ActivityEntry[];
  href: string;
  empty: string;
  showUser?: boolean;
}) {
  return (
    <Panel title={title} href={entries.length > 0 ? href : undefined}>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ol className="divide-y">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-0.5 py-2 text-sm first:pt-0 last:pb-0">
              <p>
                <span className="font-medium">{CABLE_ACTION_LABELS[entry.action]}</span> ·{" "}
                <Link href={`/cables/${entry.cable.id}`} className={CODE_LINK}>
                  {entry.cable.code}
                </Link>
              </p>
              <p className="text-muted-foreground text-xs">
                {showUser ? `${entry.user} · ` : ""}
                <time dateTime={entry.at.toISOString()}>{dateFormat.format(entry.at)}</time>
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function AdminPanel({ admin }: { admin: NonNullable<DashboardData["admin"]> }) {
  const active = ROLES.reduce((sum, role) => sum + admin.activeUsers[role], 0);
  return (
    <div className="space-y-6">
      <Panel title="Usuarios activos" href="/admin/users" linkLabel="Gestionar">
        <p>
          <span className="text-3xl font-semibold tabular-nums">{count(active)}</span>
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {ROLES.map((role) => (
            <div key={role} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{ROLE_LABELS[role]}</dt>
              <dd className="font-medium tabular-nums">{admin.activeUsers[role]}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <HealthCard database={admin.database} />
    </div>
  );
}

function Shortcuts() {
  const links = [
    {
      href: "/cables",
      label: "Buscador de cables",
      hint: "Filtra por ubicación, estado o bandeja",
    },
    { href: "/trays", label: "Bandejas", hint: "Qué cables pasan y cuáles esperan en cada una" },
    { href: "/locations", label: "Ubicaciones", hint: "Plantas, áreas y salas" },
  ];
  return (
    <Panel title="Accesos directos">
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="hover:bg-muted/60 focus-visible:ring-ring/50 -mx-2 block rounded-md px-2 py-1.5 transition-colors outline-none focus-visible:ring-3"
            >
              <span className="text-primary text-sm font-medium">{link.label} →</span>
              <span className="text-muted-foreground block text-xs">{link.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
