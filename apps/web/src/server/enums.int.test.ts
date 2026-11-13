import {
  CableAction,
  CableLevel,
  ConnectionStatus,
  InstallationStatus,
  RouteSection,
  TrayKind,
} from "@cables/db";
import {
  CABLE_ACTIONS,
  CABLE_LEVELS,
  CONNECTION_STATUSES,
  INSTALLATION_STATUSES,
  ROUTE_SECTIONS,
  TRAY_KINDS,
} from "@cables/shared";
import { describe, expect, it } from "vitest";

// The shared constants (Zod schemas, labels, filters) must list exactly the Prisma enum members.
describe("shared constants match the Prisma enums", () => {
  it.each([
    ["InstallationStatus", InstallationStatus, INSTALLATION_STATUSES],
    ["ConnectionStatus", ConnectionStatus, CONNECTION_STATUSES],
    ["CableAction", CableAction, CABLE_ACTIONS],
    ["CableLevel", CableLevel, CABLE_LEVELS],
    ["TrayKind", TrayKind, TRAY_KINDS],
    ["RouteSection", RouteSection, ROUTE_SECTIONS],
  ])("%s", (_name, prismaEnum, shared) => {
    expect([...shared].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});
