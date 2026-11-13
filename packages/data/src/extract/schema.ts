/**
 * Shape of the extracted project data (what `pnpm data:extract` writes and `pnpm data:load`
 * reads). Validated with Zod: a row that does not fit is reported with its page and left out.
 */
import { CABLE_LEVELS, ROUTE_SECTIONS, TRAY_KINDS, isTrayCode } from "@cables/shared";
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

export const projectCableSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Z0-9][A-Z0-9.\-/]*$/, "Código de cable no válido")
    .max(50),
  level: z.enum(CABLE_LEVELS),
  altCode: optionalText(50),
  revision: optionalText(20),
  description: optionalText(500),
  typeCode: optionalText(20),
  typeName: text(200),
  conductors: z.number().int().positive().nullable(),
  crossSectionMm2: z.number().positive().nullable(),
  voltageRating: optionalText(50),
  lengthM: z.number().positive().max(100_000).nullable(),
  lengthPending: z.boolean(),
  circuit: optionalText(20),
  cablesPerCircuit: z.number().int().positive().nullable(),
  composition: optionalText(50),
  diagram: optionalText(80),
  notes: optionalText(2000),
  sourceDocument: optionalText(80),
  sourceFile: text(255),
  sourcePage: z.number().int().positive(),
  origin: projectCableEndSchema,
  destination: projectCableEndSchema,
  route: z.array(projectRouteStepSchema),
});

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
    }),
  ),
});

export type ProjectCable = z.infer<typeof projectCableSchema>;
export type ProjectCableEnd = z.infer<typeof projectCableEndSchema>;
export type ProjectRouteStep = z.infer<typeof projectRouteStepSchema>;
export type ProjectTray = z.infer<typeof projectTraySchema>;

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
  issues: ExtractionIssue[];
  stats: {
    files: { name: string; pages: number; cableSheets: number; drawingSheets: number }[];
    cablesByLevel: Record<string, number>;
    traysInDrawings: number;
    traysOnlyInRoutes: number;
  };
};
