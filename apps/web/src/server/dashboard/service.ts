import "server-only";
import { prisma } from "@cables/db";
import {
  CABLE_FIELD_ACTIONS,
  CONNECTION_STATUSES,
  INSTALLATION_STATUSES,
  ROLES,
  canRunCableAction,
  hasPermission,
  type ConnectionStatus,
  type InstallationStatus,
  type Role,
} from "@cables/shared";
import { listActivity, type ActivityEntry } from "@/server/activity/service";
import { getHealth, type HealthStatus } from "@/server/health";

/** How far the works have got: what everybody sees on the home page. */
export type CableProgress = {
  total: number;
  /** Laid end to end (`LAID`). */
  laid: number;
  /** Connected at both ends. */
  connected: number;
  installation: Record<InstallationStatus, number>;
  connection: Record<ConnectionStatus, number>;
};

/**
 * The home page, by role. Everybody gets the progress of the works; who registers field
 * actions also gets their own latest ones; supervisors the breakdown and the team's activity;
 * administrators the accounts and the system. Sections a role may not see are `null` and are
 * never queried.
 */
export type Dashboard = {
  progress: CableProgress;
  myActivity: ActivityEntry[] | null;
  team: {
    trays: number;
    recentActivity: ActivityEntry[];
  } | null;
  admin: {
    pendingAccounts: number;
    activeUsers: Record<Role, number>;
    database: HealthStatus;
  } | null;
};

const RECENT = 5;

const zeroes = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

export async function getCableProgress(): Promise<CableProgress> {
  const active = { deletedAt: null };
  const [byInstallation, byConnection] = await Promise.all([
    prisma.cable.groupBy({ by: ["installationStatus"], where: active, _count: { _all: true } }),
    prisma.cable.groupBy({ by: ["connectionStatus"], where: active, _count: { _all: true } }),
  ]);
  const installation = zeroes(INSTALLATION_STATUSES);
  for (const row of byInstallation) installation[row.installationStatus] = row._count._all;
  const connection = zeroes(CONNECTION_STATUSES);
  for (const row of byConnection) connection[row.connectionStatus] = row._count._all;
  const total = Object.values(installation).reduce((sum, count) => sum + count, 0);
  return {
    total,
    laid: installation.LAID,
    connected: connection.CONNECTED,
    installation,
    connection,
  };
}

async function getTeamSummary(): Promise<NonNullable<Dashboard["team"]>> {
  // Las puntas sueltas no se cuentan aparte: la base garantiza que son los tendidos a medias.
  const [trays, recent] = await Promise.all([prisma.tray.count(), listActivity({}, RECENT)]);
  return { trays, recentActivity: recent.entries };
}

async function getAdminSummary(): Promise<NonNullable<Dashboard["admin"]>> {
  const [pendingAccounts, byRole, health] = await Promise.all([
    // Registrada y nunca aprobada: la misma regla que la lista de usuarios.
    prisma.user.count({ where: { active: false, approvedAt: null } }),
    prisma.user.groupBy({ by: ["role"], where: { active: true }, _count: { _all: true } }),
    getHealth(),
  ]);
  const activeUsers = zeroes(ROLES);
  for (const row of byRole) activeUsers[row.role] = row._count._all;
  return { pendingAccounts, activeUsers, database: health.database };
}

export async function getDashboard(user: { id: string; role: Role }): Promise<Dashboard> {
  const canAct = CABLE_FIELD_ACTIONS.some((action) => canRunCableAction(user.role, action));
  const [progress, mine, team, admin] = await Promise.all([
    getCableProgress(),
    canAct ? listActivity({ actor: user.id }, RECENT) : null,
    hasPermission(user.role, "activity:view") ? getTeamSummary() : null,
    hasPermission(user.role, "user:manage") ? getAdminSummary() : null,
  ]);
  return { progress, myActivity: mine?.entries ?? null, team, admin };
}
