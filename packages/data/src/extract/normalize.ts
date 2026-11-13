/**
 * Turns the raw text of a cable sheet into a typed cable: numbers, levels, ends, route.
 * Whatever it has to guess or cannot read becomes an issue for the report.
 */
import {
  normalizeCableCode,
  normalizeTrayCode,
  parseCableSpec,
  parseTrayCode,
  type CableLevel,
  type RouteSection,
} from "@cables/shared";
import type { RawCableEnd, RawCableSheet } from "../parse/cable-page";
import type { ProjectCable, ProjectCableEnd, ProjectRouteStep } from "./schema";

export type IssueDraft = { severity: "error" | "warning"; message: string };

const clean = (value: string | null | undefined) => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
};

/** "---" and "." are how the lists leave a cell empty. */
const cell = (value: string | null | undefined) => {
  const trimmed = clean(value);
  return trimmed && !/^[-.]+$/.test(trimmed) ? trimmed : null;
};

const LEVEL_ALIASES: Record<string, CableLevel> = {
  "1": "L1",
  L1: "L1",
  L2: "L2",
  L2S: "L2",
  S2: "L2",
  L3: "L3",
  L4: "L4",
};

function readLevel(raw: RawCableSheet, issues: IssueDraft[]): CableLevel | null {
  const value = clean(raw.level)?.toUpperCase();
  const level = value ? LEVEL_ALIASES[value] : undefined;
  if (!level) {
    issues.push({ severity: "error", message: `Nivel ilegible: "${raw.level ?? ""}".` });
    return null;
  }
  if (value === "S2" || value === "L2S") {
    issues.push({ severity: "warning", message: `Nivel "${value}" cargado como L2.` });
  }
  return level;
}

/** "142 m", "85 m (PEND.)", "137", "25,5" → metres and whether it is pending. */
export function readLength(value: string | null): { lengthM: number | null; pending: boolean } {
  const text = clean(value) ?? "";
  const pending = /PEND/i.test(text);
  const number = /(\d+(?:[.,]\d+)?)/.exec(text);
  return { lengthM: number ? Number(number[1]!.replace(",", ".")) : null, pending };
}

/** "1 de 2" stays; a plain "1" means the usual single circuit and is not stored. */
function readCircuit(value: string | null) {
  const text = clean(value);
  return text && /^\d+\s*(?:de|of|\/)\s*\d+$/i.test(text) ? text : null;
}

function readInteger(value: string | null) {
  const text = clean(value);
  return text && /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * In the instrumentation lists the room sometimes drops to the line under "Location:"; in the
 * power lists an extra line is a second equipment tag.
 */
function readEnd(end: RawCableEnd, layout: RawCableSheet["layout"]): ProjectCableEnd {
  const extra = cell(end.extra);
  const equipment = cell(end.equipment);
  return {
    equipment:
      layout === "power" && extra ? [equipment, extra].filter(Boolean).join(" / ") : equipment,
    cubicle: cell(end.cubicle),
    gland: cell(end.gland),
    functionKks: cell(end.functionKks),
    installationKks: cell(end.installationKks),
    room: cell(end.location) ?? (layout === "instrument" ? extra : null),
  };
}

const SECTION_MARKERS: Record<string, RouteSection> = {
  FIELD_TRAY: "FIELD",
  ROOM_TRAY: "ROOM",
};

/** Looks like a tray code but does not follow the codification (a typo in the list). */
const ALMOST_A_TRAY = /^\d{2}U[A-Z0-9_]{3,}\d{3,}$/;

export function readRoute(route: readonly string[], issues: IssueDraft[]): ProjectRouteStep[] {
  const steps: ProjectRouteStep[] = [];
  let section: RouteSection | null = null;
  for (const raw of route) {
    const text = clean(raw);
    if (!text) continue;
    const marker = SECTION_MARKERS[text.toUpperCase()];
    if (marker) {
      section = marker;
      continue;
    }
    // A tray code, alone or followed by a note in brackets: "99UXT_2D20028 (S)".
    const [first = "", ...rest] = text.split(" ");
    const tray = parseTrayCode(first);
    if (tray && (rest.length === 0 || /^\(.*\)$/.test(rest.join(" ")))) {
      steps.push({ label: [tray.code, ...rest].join(" "), trayCode: tray.code, section });
      continue;
    }
    if (ALMOST_A_TRAY.test(normalizeTrayCode(text))) {
      issues.push({
        severity: "warning",
        message: `"${text}" parece una bandeja pero no sigue la codificación: se guarda como texto.`,
      });
    }
    steps.push({ label: text, trayCode: null, section });
  }
  return steps;
}

export function normalizeCableSheet(
  raw: RawCableSheet,
  sourceFile: string,
): { cable: ProjectCable | null; code: string | null; issues: IssueDraft[] } {
  const issues: IssueDraft[] = [];
  const rawCode = clean(raw.code);
  const code = rawCode ? normalizeCableCode(rawCode) : null;
  if (!code) {
    return {
      cable: null,
      code: null,
      issues: [{ severity: "error", message: "Ficha sin código de cable." }],
    };
  }
  const footer = clean(raw.footerCode);
  if (footer && normalizeCableCode(footer) !== code) {
    issues.push({
      severity: "error",
      message: `El código de la cabecera (${code}) no coincide con el del pie (${footer}).`,
    });
  }

  const level = readLevel(raw, issues);
  const typeName = clean(raw.typeText) ?? clean(raw.typeCode);
  if (!typeName) {
    issues.push({ severity: "error", message: "Ficha sin tipo de cable." });
  }
  const length = readLength(raw.length);
  const { pending } = length;
  // A length of 0 is a placeholder in the lists, not a real length.
  const lengthM = length.lengthM === 0 ? null : length.lengthM;
  if (lengthM === null) {
    issues.push({
      severity: "warning",
      message: `Sin longitud en el listado ("${clean(raw.length) ?? ""}").`,
    });
  } else if (pending) {
    issues.push({ severity: "warning", message: "Longitud pendiente de confirmar." });
  }
  const spec = typeName ? parseCableSpec(typeName) : {};

  if (issues.some((issue) => issue.severity === "error") || !level || !typeName) {
    return { cable: null, code, issues };
  }

  return {
    code,
    issues,
    cable: {
      code,
      level,
      altCode: clean(raw.altCode),
      revision: clean(raw.revision),
      description: clean(raw.service),
      typeCode: clean(raw.typeCode),
      typeName,
      conductors: spec.conductors ?? null,
      crossSectionMm2: spec.crossSectionMm2 ?? null,
      voltageRating: spec.voltageRating ?? null,
      lengthM,
      lengthPending: pending,
      circuit: readCircuit(raw.circuit),
      cablesPerCircuit: readInteger(raw.cablesPerCircuit),
      composition: clean(raw.composition),
      diagram: cell(raw.diagram),
      notes: clean(raw.observations),
      sourceDocument: clean(raw.document),
      sourceFile,
      sourcePage: raw.page,
      origin: readEnd(raw.from, raw.layout),
      destination: readEnd(raw.to, raw.layout),
      route: readRoute(raw.route, issues),
    },
  };
}

/** Orders revisions like "1" < "2" < "2_RX00" < "2_RX01" < "3" < "03_RX00". */
export function compareRevisions(a: string | null, b: string | null): number {
  const parts = (value: string | null) => {
    const match = /^(\d+)(?:_RX(\d+))?/i.exec(value ?? "");
    return match ? [Number(match[1]), match[2] === undefined ? -1 : Number(match[2])] : [-1, -1];
  };
  const [majorA, minorA] = parts(a);
  const [majorB, minorB] = parts(b);
  return majorA! - majorB! || minorA! - minorB!;
}
