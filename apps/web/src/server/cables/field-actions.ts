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
      currentLocationId: true,
      originId: true,
      destinationId: true,
    },
  });
  if (!cable) {
    throw new CableServiceError(NOT_FOUND);
  }
  if (cable.version !== request.version) {
    throw new CableServiceError(CONFLICT);
  }

  const input = toCableActionInput(request);
  const outcome = applyCableAction({ ...cable, deleted: cable.deletedAt !== null }, input);
  if (!outcome.ok) {
    throw new CableServiceError(outcome.error);
  }

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
        ...outcome.next,
        version: { increment: 1 },
        lastAction: request.action,
        lastActionById: actor.id,
        lastActionAt: now,
        ...(request.action === "LAID" ? { installedById: actor.id, installedAt: now } : {}),
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
