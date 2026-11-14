import "server-only";
import { prisma } from "@cables/db";
import {
  CABLE_ACTION_LABELS,
  applyCableAction,
  canRunCableAction,
  toCableActionInput,
  type CableActionRequest,
  type Role,
} from "@cables/shared";
import { CableServiceError } from "./service";

const CONFLICT =
  "Otra persona ha registrado un movimiento en este cable mientras tanto. Recarga la página y vuelve a intentarlo.";
const NOT_FOUND = "El cable no existe.";

type Actor = { id: string; role: Role };

/**
 * Runs a field action (lay, coil, connect…) on a cable. In one transaction it updates the
 * cable, writes the immutable CableEvent and refreshes the summary columns. The `version`
 * read by the user must still be current: if somebody else acted in between, nothing is
 * written and the user gets a conflict message.
 */
export async function runCableAction(
  actor: Actor,
  request: CableActionRequest,
): Promise<{ cableId: string; message: string }> {
  // Defense in depth: the Server Action already checked the permission.
  if (!canRunCableAction(actor.role, request.action)) {
    throw new CableServiceError("No tienes permiso para realizar esta acción.");
  }

  const cable = await prisma.cable.findUnique({
    where: { id: request.cableId },
    select: {
      id: true,
      code: true,
      version: true,
      deletedAt: true,
      installationStatus: true,
      connectionStatus: true,
      testStatus: true,
      currentLocationId: true,
      originId: true,
      destinationId: true,
      originEquipment: true,
      destinationEquipment: true,
      looseEnd: true,
      looseEndTray: { select: { code: true } },
    },
  });
  if (!cable) {
    throw new CableServiceError(NOT_FOUND);
  }
  if (cable.version !== request.version) {
    throw new CableServiceError(CONFLICT);
  }

  const input = toCableActionInput(request);
  const outcome = applyCableAction(
    {
      ...cable,
      // Cables from the project lists may know the equipment but not the room.
      originId: cable.originId ?? cable.originEquipment,
      destinationId: cable.destinationId ?? cable.destinationEquipment,
      looseEndTray: cable.looseEndTray?.code ?? null,
      deleted: cable.deletedAt !== null,
    },
    input,
  );
  if (!outcome.ok) {
    throw new CableServiceError(outcome.error);
  }
  const { looseEndTray: looseEndTrayCode, ...nextValues } = outcome.next;
  const looseEndTrayId = await resolveLooseEndTray(
    cable.id,
    looseEndTrayCode,
    cable.looseEndTray?.code ?? null,
    // A supervisor's correction states the truth; in the field the user confirms it.
    request.action === "CORRECTION" ||
      (request.action === "PARTIALLY_LAID" && request.confirmOffRoute),
  );

  const newLocationId = outcome.next.currentLocationId;
  if (newLocationId && newLocationId !== cable.currentLocationId) {
    const exists = await prisma.location.count({ where: { id: newLocationId } });
    if (exists === 0) {
      throw new CableServiceError("La ubicación elegida ya no existe.");
    }
  }
  if (input.action === "CORRECTION") {
    const corrected = await prisma.cableEvent.count({
      where: { id: input.correctsEventId, cableId: cable.id },
    });
    if (corrected === 0) {
      throw new CableServiceError("El movimiento que quieres corregir no es de este cable.");
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // The `version` condition makes the check and the write atomic.
    const { count } = await tx.cable.updateMany({
      where: { id: cable.id, version: request.version, deletedAt: null },
      data: {
        ...nextValues,
        looseEndTrayId,
        version: { increment: 1 },
        lastAction: request.action,
        lastActionById: actor.id,
        lastActionAt: now,
        ...(request.action === "LAID" || request.action === "PARTIALLY_LAID"
          ? { installedById: actor.id, installedAt: now }
          : {}),
        ...(request.action === "CONNECTED" ? { connectedById: actor.id, connectedAt: now } : {}),
      },
    });
    if (count === 0) {
      throw new CableServiceError(CONFLICT);
    }
    await tx.cableEvent.create({
      data: {
        cableId: cable.id,
        userId: actor.id,
        action: request.action,
        changes: outcome.changes,
        notes: request.notes,
        fromLocationId: outcome.fromLocationId,
        toLocationId: outcome.toLocationId,
        correctsEventId: input.action === "CORRECTION" ? input.correctsEventId : null,
        createdAt: now,
      },
    });
  });

  return {
    cableId: cable.id,
    message: `Movimiento registrado en ${cable.code}: ${CABLE_ACTION_LABELS[request.action].toLowerCase()}.`,
  };
}

/**
 * The id of the tray where the loose end waits. A new tray must exist. When the cable has a
 * planned route through known trays and the tray is not on it, the user must confirm it: in
 * the field a cable is sometimes found off its planned way, and that is worth recording.
 */
async function resolveLooseEndTray(
  cableId: string,
  code: string | null,
  currentCode: string | null,
  offRouteConfirmed: boolean,
): Promise<string | null> {
  if (code === null) return null;
  const tray = await prisma.tray.findUnique({ where: { code }, select: { id: true } });
  if (!tray) {
    throw new CableServiceError(`La bandeja ${code} no existe.`);
  }
  if (code === currentCode) return tray.id;
  const routeTrays = await prisma.cableRouteStep.findMany({
    where: { cableId, trayId: { not: null } },
    select: { trayId: true },
  });
  if (
    !offRouteConfirmed &&
    routeTrays.length > 0 &&
    !routeTrays.some((step) => step.trayId === tray.id)
  ) {
    throw new CableServiceError(
      `La bandeja ${code} no está en el recorrido previsto del cable. Si el cable está ahí, confírmalo.`,
    );
  }
  return tray.id;
}
