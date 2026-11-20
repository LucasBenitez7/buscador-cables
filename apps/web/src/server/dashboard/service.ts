import "server-only";
import { prisma } from "@cables/db";
import {
  CABLE_FIELD_ACTIONS,
  CONNECTION_STATUSES,
  EXCEL_KINDS,
  EXCEL_KIND_LABELS,
  INSTALLATION_STATUSES,
  formatExcelDay,
  ROLES,
  TEST_STATUSES,
  canRunCableAction,
  hasPermission,
  type ConnectionStatus,
  type InstallationStatus,
  type TestStatus,
} from "@cables/shared";
import { listActivity, type ActivityEntry } from "@/server/activity/service";
import { getMetersProgress } from "@/server/meters/service";
import { hasDrawingImage } from "@/server/drawings/store";
import { countNewDiscrepancies } from "@/server/excel-import/discrepancies";
import { getHealth, type HealthStatus } from "@/server/health";

/** How far the works have got: what everybody sees on the home page. */
export type CableProgress = {
  total: number;
  /** Laid end to end (`LAID`). */
  laid: number;
  /** Connected at both ends. */
  connected: number;
  /** Timbrado OK. */
  tested: number;
  installation: Record<InstallationStatus, number>;
  connection: Record<ConnectionStatus, number>;
  test: Record<TestStatus, number>;
};

/**
 * The home page, by role. Everybody gets the progress of the works; who registers field
 * actions also gets their own latest ones; supervisors the breakdown and the team's activity;
 * administrators the accounts and the system. Sections a role may not see are `null` and are
 * never queried.
 */
export type Dashboard = {
  progress: CableProgress;
  /** Metres laid of the planned ones (fase 17): the details are in «Metros». */
  meters: { planned: number; laid: number };
  /** The date of the last Excel applied of each kind: how recent the progress is. */
  lastExcel: { kind: string; label: string; excelDay: string }[];
  /** Pending discrepancies new since they last opened «Pendientes de revisar». */
  toReview: number | null;
  myActivity: ActivityEntry[] | null;
  team: {
    trays: number;
    recentActivity: ActivityEntry[];
  } | null;
  admin: {
    pendingAccounts: number;
    /** Active people per role id, and the name of each role (fase 12: roles can be made). */
    activeUsers: Record<string, number>;
    roleNames: Record<string, string>;
    database: HealthStatus;
    /**
     * Sheets of the drawings loaded and how many have their tiles. Without tiles the tray
     * and cable pages show no drawing, and nothing else says so (revisión F7.5, A2).
     */
    drawings: { sheets: number; drawn: number };
  } | null;
};

const RECENT = 5;

const zeroes = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

export async function getCableProgress(): Promise<CableProgress> {
  const active = { deletedAt: null };
  const [byInstallation, byConnection, byTest] = await Promise.all([
    prisma.cable.groupBy({ by: ["installationStatus"], where: active, _count: { _all: true } }),
    prisma.cable.groupBy({ by: ["connectionStatus"], where: active, _count: { _all: true } }),
    prisma.cable.groupBy({ by: ["testStatus"], where: active, _count: { _all: true } }),
  ]);
  const installation = zeroes(INSTALLATION_STATUSES);
  for (const row of byInstallation) installation[row.installationStatus] = row._count._all;
  const connection = zeroes(CONNECTION_STATUSES);
  for (const row of byConnection) connection[row.connectionStatus] = row._count._all;
  const test = zeroes(TEST_STATUSES);
  for (const row of byTest) test[row.testStatus] = row._count._all;
  const total = Object.values(installation).reduce((sum, count) => sum + count, 0);
  return {
    total,
    laid: installation.LAID,
    connected: connection.CONNECTED,
    tested: test.TESTED_OK,
    installation,
    connection,
    test,
  };
}

async function getLastExcel(): Promise<Dashboard["lastExcel"]> {
  const found = await Promise.all(
    EXCEL_KINDS.map((kind) =>
      prisma.excelImport.findFirst({
        where: { kind, status: "APPLIED" },
        orderBy: { excelDate: "desc" },
        select: { excelDate: true },
      }),
    ),
  );
  return EXCEL_KINDS.flatMap((kind, index) => {
    const excel = found[index];
    return excel
      ? [
          {
            kind,
            label: EXCEL_KIND_LABELS[kind],
            excelDay: formatExcelDay(excel.excelDate.toISOString().slice(0, 10)),
          },
        ]
      : [];
  });
}

async function getTeamSummary(): Promise<NonNullable<Dashboard["team"]>> {
  // Las puntas sueltas no se cuentan aparte: la base garantiza que son los tendidos a medias.
  const [trays, recent] = await Promise.all([prisma.tray.count(), listActivity({}, RECENT)]);
  return { trays, recentActivity: recent.entries };
}

async function getAdminSummary(): Promise<NonNullable<Dashboard["admin"]>> {
  const [pendingAccounts, byRole, health, drawings] = await Promise.all([
    // Registrada y nunca aprobada: la misma regla que la lista de usuarios.
    prisma.user.count({ where: { active: false, approvedAt: null } }),
    prisma.user.groupBy({ by: ["role"], where: { active: true }, _count: { _all: true } }),
    getHealth(),
    getDrawingImages(),
  ]);
  // Por rol: los de siempre (aunque no tengan a nadie) y los creados en la web.
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const activeUsers: Record<string, number> = zeroes(ROLES);
  for (const row of byRole) activeUsers[row.role] = row._count._all;
  const roleNames = Object.fromEntries(roles.map((role) => [role.id, role.name]));
  return { pendingAccounts, activeUsers, roleNames, database: health.database, drawings };
}

async function getDrawingImages(): Promise<{ sheets: number; drawn: number }> {
  const sheets = await prisma.drawingSheet.findMany({ select: { imageKey: true } });
  const drawn = await Promise.all(sheets.map(({ imageKey }) => hasDrawingImage(imageKey)));
  return { sheets: sheets.length, drawn: drawn.filter(Boolean).length };
}

export async function getDashboard(user: {
  id: string;
  permissions: readonly string[];
}): Promise<Dashboard> {
  const canAct = CABLE_FIELD_ACTIONS.some((action) => canRunCableAction(user, action));
  const [progress, meters, lastExcel, toReview, mine, team, admin] = await Promise.all([
    getCableProgress(),
    getMetersProgress(),
    getLastExcel(),
    hasPermission(user, "cable:correct") ? countNewDiscrepancies(user.id) : null,
    canAct ? listActivity({ actor: user.id }, RECENT) : null,
    hasPermission(user, "activity:view") ? getTeamSummary() : null,
    hasPermission(user, "user:manage") ? getAdminSummary() : null,
  ]);
  return {
    progress,
    meters: { planned: meters.planned, laid: meters.laid },
    lastExcel,
    toReview,
    myActivity: mine?.entries ?? null,
    team,
    admin,
  };
}
