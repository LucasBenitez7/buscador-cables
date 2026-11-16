import "server-only";
import { prisma } from "@cables/db";
import {
  WIRING_FIELDS,
  findDuplicateTerminals,
  hasPermission,
  wiringChangeKey,
  type DuplicateTerminal,
  type Role,
  type WireTerminals,
  type WiringChange,
  type WiringEdit,
} from "@cables/shared";
import { CableServiceError } from "./service";

const CONFLICT =
  "Otra persona ha cambiado este cable mientras editabas. Recarga la página y vuelve a hacer los cambios.";

type Actor = { id: string; role: Role };

export type WiringEditResult =
  | { status: "saved"; cableId: string; changedWires: number }
  | { status: "unchanged"; cableId: string }
  /** Nothing written: the user must confirm that two wires share a terminal. */
  | { status: "duplicates"; cableId: string; duplicates: DuplicateTerminal[] };

/**
 * Saves the terminals corrected in the field (modo editar del conexionado). In one transaction
 * it updates the changed wires, bumps the cable version and writes one WIRING_EDITED event with
 * every changed cell, so the activity shows one line and its detail page the whole change.
 *
 * Safe against stale screens: the `version` the user opened must still be current, and the
 * table must have the same wires as the database (a reload of the lists may change them).
 */
export async function editWiring(actor: Actor, edit: WiringEdit): Promise<WiringEditResult> {
  // Defense in depth: the Server Action already checked the permission.
  if (!hasPermission(actor.role, "cable:wiring")) {
    throw new CableServiceError("No tienes permiso para corregir bornas.");
  }

  const cable = await prisma.cable.findUnique({
    where: { id: edit.cableId },
    select: {
      id: true,
      version: true,
      deletedAt: true,
      wires: { orderBy: { position: "asc" } },
    },
  });
  if (!cable) throw new CableServiceError("El cable no existe.");
  if (cable.deletedAt) throw new CableServiceError("El cable está dado de baja.");
  if (cable.version !== edit.version) throw new CableServiceError(CONFLICT);

  const sent = new Map(edit.wires.map((wire) => [wire.position, wire]));
  if (sent.size !== cable.wires.length || cable.wires.some((wire) => !sent.has(wire.position))) {
    throw new CableServiceError(CONFLICT);
  }

  const changes: Record<string, WiringChange> = {};
  const updates: { position: number; data: Partial<WireTerminals> }[] = [];
  const after = cable.wires.map((wire) => {
    const next = sent.get(wire.position)!;
    const data: Partial<WireTerminals> = {};
    for (const field of WIRING_FIELDS) {
      if (next[field] === wire[field]) continue;
      data[field] = next[field];
      changes[wiringChangeKey(wire.position, field)] = {
        from: wire[field],
        to: next[field],
        wire: wire.wire,
      };
    }
    if (Object.keys(data).length > 0) updates.push({ position: wire.position, data });
    return { ...wire, ...data };
  });

  if (updates.length === 0) return { status: "unchanged", cableId: cable.id };

  const duplicates = findDuplicateTerminals(
    after,
    new Set(updates.map((update) => update.position)),
  );
  if (duplicates.length > 0 && !edit.confirmDuplicates) {
    return { status: "duplicates", cableId: cable.id, duplicates };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // The `version` condition makes the check and the write atomic.
    const { count } = await tx.cable.updateMany({
      where: { id: cable.id, version: edit.version, deletedAt: null },
      data: {
        version: { increment: 1 },
        lastAction: "WIRING_EDITED",
        lastActionById: actor.id,
        lastActionAt: now,
      },
    });
    if (count === 0) throw new CableServiceError(CONFLICT);
    for (const update of updates) {
      await tx.cableWire.update({
        where: { cableId_position: { cableId: cable.id, position: update.position } },
        data: update.data,
      });
    }
    await tx.cableEvent.create({
      data: {
        cableId: cable.id,
        userId: actor.id,
        action: "WIRING_EDITED",
        changes,
        notes: edit.notes,
        createdAt: now,
      },
    });
  });

  return { status: "saved", cableId: cable.id, changedWires: updates.length };
}
