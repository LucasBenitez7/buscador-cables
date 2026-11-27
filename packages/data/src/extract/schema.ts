/**
 * Shape of the extracted project data (what `pnpm data:extract` writes and `pnpm data:load`
 * reads). Validated with Zod: a row that does not fit is reported with its page and left out.
 */
import {
  drawingMarkSchema,
  CABLE_LEVELS,
  CABLE_TEXT_LIMITS,
  ROUTE_SECTIONS,
  TRAY_KINDS,
  isTrayCode,
} from "@cables/shared";
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable();

export const projectCableEndSchema = z.object({
  equipment: optionalText(120),
  cubicle: optionalText(60),
  gland: optionalText(60),
  functionKks: optionalText(60),
  installationKks: optionalText(60),
  /** Room as printed ("99UXB16RA001"); may be another unit or a free text. */
  room: optionalText(60),
});

export const projectRouteStepSchema = z
  .object({
    label: text(80),
    trayCode: z.string().refine(isTrayCode, "Código de bandeja no válido").nullable(),
    section: z.enum(ROUTE_SECTIONS).nullable(),
  })
  .refine((step) => step.trayCode === null || step.label.startsWith(step.trayCode), {
    message: "El texto del paso debe empezar por el código de su bandeja",
  });

/**
 * Terminal strip / block and terminal / point as printed ("X51", "1B2A TBAI", "-Direct",
 * "Note 1"). Generous limit: a long cell must not drop the whole cable.
 */
const terminalText = optionalText(120);

/** A wire of the cable and where it goes at each end (the INTERCONNECTION table). */
export const projectWireSchema = z.object({
  position: z.number().int().positive(),
  wire: text(40),
  colour: optionalText(60),
  originBlock: terminalText,
  originPoint: terminalText,
  destinationBlock: terminalText,
  destinationPoint: terminalText,
});

/** A bridge between two terminals (the JUMPERS table of the power lists). */
export const projectJumperSchema = z.object({
  position: z.number().int().positive(),
  code: text(80),
  fromBlock: terminalText,
  fromPoint: terminalText,
  toBlock: terminalText,
  toPoint: terminalText,
});

export const projectCableSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Z0-9][A-Z0-9.\-/]*$/, "Código de cable no válido")
    .max(50),
  level: z.enum(CABLE_LEVELS),
  altCode: optionalText(50),
  revision: optionalText(20),
  // The same limits as the edit form: a cable must be editable after it is loaded.
  description: optionalText(CABLE_TEXT_LIMITS.description),
  typeCode: optionalText(20),
  typeName: text(200),
  conductors: z.number().int().positive().nullable(),
  crossSectionMm2: z.number().positive().nullable(),
  voltageRating: optionalText(CABLE_TEXT_LIMITS.voltageRating),
  lengthM: z.number().positive().max(100_000).nullable(),
  lengthPending: z.boolean(),
  circuit: optionalText(20),
  cablesPerCircuit: z.number().int().positive().nullable(),
  composition: optionalText(50),
  diagram: optionalText(80),
  notes: optionalText(CABLE_TEXT_LIMITS.notes),
  sourceDocument: optionalText(80),
  sourceFile: text(255),
  sourcePage: z.number().int().positive(),
  /** Changes when the text of the cable's page changes: `data:render` draws it again. */
  sourceFingerprint: text(64),
  origin: projectCableEndSchema,
  destination: projectCableEndSchema,
  route: z.array(projectRouteStepSchema),
  wiringRevision: optionalText(20),
  wires: z.array(projectWireSchema),
  jumpers: z.array(projectJumperSchema),
});

/**
 * Where a tray is on a sheet, as a fraction of the sheet from the top-left corner. "label": its
 * code drawn along it; "flag": the flag of its section; "table": its row in a table.
 */
export const trayMarkSchema = drawingMarkSchema;

export const projectTraySchema = z.object({
  code: z.string().refine(isTrayCode, "Código de bandeja no válido"),
  kind: z.enum(TRAY_KINDS),
  voltageLevel: z.number().int().min(1).max(4),
  elevationLevel: z.number().int().min(0).max(9),
  areaCode: text(20),
  widthMm: z.number().int().positive().nullable(),
  flangeHeightMm: z.number().int().positive().nullable(),
  bendRadiusMm: z.number().int().positive().nullable(),
  diameterMm: z.number().int().positive().nullable(),
  drawings: z.array(
    z.object({
      drawing: text(80),
      sheet: text(10),
      title: optionalText(300),
      sourcePage: z.number().int().positive(),
      marks: z.array(trayMarkSchema),
    }),
  ),
});

/**
 * Where an equipment is drawn (fase 19): the sheets where its code is written, with what the
 * sheet writes («drawnAs»: the tag, or the instrument without its part) and where.
 */
export const projectEquipmentSchema = z.object({
  tag: text(120),
  drawings: z.array(
    z.object({
      drawing: text(80),
      sheet: text(10),
      title: optionalText(300),
      sourcePage: z.number().int().positive(),
      drawnAs: text(120),
      marks: z.array(trayMarkSchema),
    }),
  ),
});

/** A sheet of the routing drawings: what `data:render` draws and `data:load` stores. */
export const projectSheetSchema = z.object({
  drawing: text(80),
  sheet: text(10),
  title: optionalText(300),
  file: text(255),
  page: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fingerprint: text(64),
});

export type ProjectCable = z.infer<typeof projectCableSchema>;
export type ProjectCableEnd = z.infer<typeof projectCableEndSchema>;
export type ProjectRouteStep = z.infer<typeof projectRouteStepSchema>;
export type ProjectWire = z.infer<typeof projectWireSchema>;
export type ProjectJumper = z.infer<typeof projectJumperSchema>;
export type ProjectTray = z.infer<typeof projectTraySchema>;
export type ProjectSheet = z.infer<typeof projectSheetSchema>;
export type ProjectEquipment = z.infer<typeof projectEquipmentSchema>;
export type TrayMark = z.infer<typeof trayMarkSchema>;

export type IssueSeverity = "error" | "warning";

/** Something the extraction could not read or had to decide: shown in the report. */
export type ExtractionIssue = {
  severity: IssueSeverity;
  file: string;
  page: number | null;
  code: string | null;
  message: string;
};

export type ExtractionResult = {
  cables: ProjectCable[];
  trays: ProjectTray[];
  sheets: ProjectSheet[];
  equipment: ProjectEquipment[];
  issues: ExtractionIssue[];
  stats: {
    files: { name: string; pages: number; cableSheets: number; drawingSheets: number }[];
    cablesByLevel: Record<string, number>;
    traysInDrawings: number;
    traysOnlyInRoutes: number;
    /** How the trays were found on the plans (see `locateTrays`). */
    trayMarks: { label: number; flag: number; tableOnly: number };
    /** Cables with a wiring table, and the wires and jumpers read. */
    wiring: { cables: number; wires: number; jumpers: number };
    /** Equipment of the lists found on the plans: by their tag, or by their instrument. */
    equipment: { total: number; exact: number; related: number };
  };
};
