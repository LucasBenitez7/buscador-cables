/**
 * Reads one cable sheet ("ficha") of the cable lists: one page per cable. Two layouts:
 * instrumentation (L1) and power (L2-L4). See docs/DATOS-PROYECTO.md.
 *
 * The output is raw text, as printed; `normalize.ts` turns it into typed values.
 */
import { below, compact, findLabel, lines, region, rightOf, runsIn, type Box } from "../pdf/layout";
import type { PdfPage, TextRun } from "../pdf/read-pdf";

export type RawCableEnd = {
  equipment: string | null;
  cubicle: string | null;
  gland: string | null;
  functionKks: string | null;
  installationKks: string | null;
  location: string | null;
  /** Text in the end column that is not on any labelled row. */
  extra: string | null;
};

/** A terminal of the wiring table: terminal strip or block, and terminal or point. */
export type RawTerminal = { block: string | null; point: string | null };

/** A row of the INTERCONNECTION table: one wire (or shield) of the cable. */
export type RawWire = {
  wire: string | null;
  /** Instrumentation only ("1.Blue"); the power lists name the wire by its colour code. */
  colour: string | null;
  from: RawTerminal;
  to: RawTerminal;
};

/** A row of the JUMPERS table of the power lists: a bridge between two terminals. */
export type RawJumper = { code: string | null; from: RawTerminal; to: RawTerminal };

export type RawCableSheet = {
  layout: "instrument" | "power";
  page: number;
  document: string | null;
  code: string | null;
  /** The code printed in the footer: it must match `code`. */
  footerCode: string | null;
  altCode: string | null;
  revision: string | null;
  level: string | null;
  length: string | null;
  typeCode: string | null;
  typeText: string | null;
  service: string | null;
  circuit: string | null;
  cablesPerCircuit: string | null;
  composition: string | null;
  diagram: string | null;
  loop: string | null;
  from: RawCableEnd;
  to: RawCableEnd;
  /** Route column top to bottom, as printed (trays, markers, notes). */
  route: string[];
  observations: string | null;
  /** Null when the page has no INTERCONNECTION table that can be read. */
  wires: RawWire[] | null;
  jumpers: RawJumper[];
  /** Revision of the wiring table ("R. 5" next to INTERCONNECTION), power lists only. */
  wiringRevision: string | null;
};

const TYPE_CODE = /^[A-Z]{1,2}\d{3,5}[A-Z]?$/;

/** Which layout a page has, or null if it is not a cable sheet (cover, index, notes…). */
export function cableSheetLayout(page: PdfPage): RawCableSheet["layout"] | null {
  if (!findLabel(page.runs, "CABLE ID")) return null;
  if (findLabel(page.runs, "SERVICE LEVEL")) return "power";
  if (findLabel(page.runs, "DIAGRAM") || findLabel(page.runs, "LOOP")) return "instrument";
  return null;
}

export function parseCableSheet(page: PdfPage): RawCableSheet | null {
  const layout = cableSheetLayout(page);
  if (layout === "power") return parsePowerSheet(page);
  if (layout === "instrument") return parseInstrumentSheet(page);
  return null;
}

function emptyEnd(): RawCableEnd {
  return {
    equipment: null,
    cubicle: null,
    gland: null,
    functionKks: null,
    installationKks: null,
    location: null,
    extra: null,
  };
}

function documentCode({ runs, height }: PdfPage): string | null {
  for (const run of runs) {
    if (run.top > height * 0.12) continue;
    const match = /^Code:\s*(\S+)/i.exec(run.text);
    if (match) return match[1]!;
  }
  return null;
}

function footerCode({ runs, width, height }: PdfPage): string | null {
  const footer = runs
    .filter((run) => run.top > height * 0.93 && run.x0 < width * 0.2)
    .sort((a, b) => a.top - b.top);
  return footer[0]?.text.split(" ")[0] ?? null;
}

type EndField = Exclude<keyof RawCableEnd, "extra">;

/**
 * The FROM / TO block: a column of row labels ("Equipment ID:", "Gland:"…) and two value
 * columns under the FROM and TO headers. Each value goes to the nearest row and column.
 */
function readEnds(runs: readonly TextRun[], rows: [label: string, field: EndField][]) {
  const from = emptyEnd();
  const to = emptyEnd();
  const labels = rows
    .map(([label, field]) => ({ field, box: findLabel(runs, label) }))
    .filter((row): row is { field: EndField; box: Box } => row.box !== null);
  const first = labels[0]?.box;
  if (!first) return { from, to };

  const fromHeader = runs.find(
    (run) =>
      compact(run.text) === "FROM" &&
      run.top > first.top - 30 &&
      run.top < first.top - 2 &&
      run.x0 > first.x1,
  );
  if (!fromHeader) return { from, to };
  const toHeader = runs.find(
    (run) =>
      compact(run.text) === "TO" &&
      Math.abs(run.top - fromHeader.top) < 3 &&
      run.x0 > fromHeader.x1 &&
      run.x0 < fromHeader.x1 + 250,
  );
  if (!toHeader) return { from, to };

  const fromX = (fromHeader.x0 + fromHeader.x1) / 2;
  const toX = (toHeader.x0 + toHeader.x1) / 2;
  const middle = (fromX + toX) / 2;
  const lastRow = Math.max(...labels.map((row) => row.box.top));
  const labelsRight = Math.max(...labels.map((row) => row.box.x1));
  const zone = runsIn(runs, {
    top: fromHeader.top + 3,
    bottom: lastRow + 18,
    left: labelsRight + 2,
    right: toX + (toX - fromX),
  });
  const extras = { from: [] as string[], to: [] as string[] };
  for (const run of zone) {
    const side = (run.x0 + run.x1) / 2 < middle ? "from" : "to";
    const end = side === "from" ? from : to;
    const nearest = labels.reduce((best, row) =>
      Math.abs(row.box.top - run.top) < Math.abs(best.box.top - run.top) ? row : best,
    );
    if (Math.abs(nearest.box.top - run.top) < 4) {
      end[nearest.field] = end[nearest.field] ? `${end[nearest.field]} ${run.text}` : run.text;
    } else {
      extras[side].push(run.text);
    }
  }
  from.extra = extras.from.join(" ") || null;
  to.extra = extras.to.join(" ") || null;
  return { from, to };
}

function readRoute(runs: readonly TextRun[], top: number, bottom: number, right: number) {
  return runsIn(runs, { top, bottom, right }).map((run) => run.text);
}

/**
 * The header line of a table: the line that holds `first`, below `top`, with exactly the
 * `expected` labels left to right. Null if the page does not have it (another layout).
 */
function tableHeader(
  runs: readonly TextRun[],
  first: string,
  expected: readonly string[],
  top: number,
  bottom: number,
): TextRun[] | null {
  const label = findLabel(runs, first, (box) => box.top > top && box.top < bottom);
  if (!label) return null;
  const line = lines(runs.filter((run) => Math.abs(run.top - label.top) < 2.5))[0] ?? [];
  const header = line.filter((run) => run.x0 >= label.x0 - 1);
  const names = header.map((run) => compact(run.text));
  return names.length === expected.length &&
    names.every((name, i) => name === compact(expected[i]!))
    ? header
    : null;
}

/**
 * The rows of a table under its header, between `top` and `bottom`: each text goes to the
 * column whose header centre is nearest. A line without text in the first column is not a row
 * (stray marks such as an empty revision box).
 */
function tableRows(
  runs: readonly TextRun[],
  header: readonly TextRun[],
  top: number,
  bottom: number,
): (string | null)[][] {
  const centres = header.map((run) => (run.x0 + run.x1) / 2);
  const left = header[0]!.x0 - 15;
  const rows: (string | null)[][] = [];
  for (const line of lines(runsIn(runs, { top, bottom, left }))) {
    const cells: string[][] = header.map(() => []);
    for (const run of line) {
      const middle = (run.x0 + run.x1) / 2;
      const column = centres.reduce(
        (best, centre, index) =>
          Math.abs(centre - middle) < Math.abs(centres[best]! - middle) ? index : best,
        0,
      );
      cells[column]!.push(run.text);
    }
    const row = cells.map((texts) => texts.join(" ").trim() || null);
    if (row[0]) rows.push(row);
  }
  return rows;
}

const terminal = (block: string | null | undefined, point: string | null | undefined) => ({
  block: block ?? null,
  point: point ?? null,
});

const INSTRUMENT_WIRING = [
  "Wire No.",
  "Colour",
  "Terminal Strip (End 1)",
  "T.B. (End 1)",
  "Terminal Strip (End 2)",
  "T.B. (End 2)",
] as const;
const POWER_WIRING = ["WIRE", "BLOCK", "POINT", "BLOCK", "POINT"] as const;
const POWER_JUMPERS = ["JUMPER", "BLOCK", "POINT", "BLOCK", "POINT"] as const;

function readInstrumentWiring(page: PdfPage, interconnection: Box | null, bottom: number) {
  if (!interconnection) return null;
  const { runs } = page;
  const header = tableHeader(
    runs,
    "Wire No.",
    INSTRUMENT_WIRING,
    interconnection.top,
    interconnection.top + 40,
  );
  if (!header) return null;
  return tableRows(runs, header, header[0]!.top + 4, bottom).map(
    ([wire, colour, fromBlock, fromPoint, toBlock, toPoint]): RawWire => ({
      wire: wire ?? null,
      colour: colour ?? null,
      from: terminal(fromBlock, fromPoint),
      to: terminal(toBlock, toPoint),
    }),
  );
}

function readPowerWiring(page: PdfPage, interconnection: Box | null, bottom: number) {
  const { runs } = page;
  if (!interconnection) return { wires: null, jumpers: [], wiringRevision: null };
  const jumpersLabel = findLabel(runs, "JUMPERS", (box) => box.top > interconnection.top);
  const tableBottom = (jumpersLabel?.top ?? bottom) - 2;

  const header = tableHeader(
    runs,
    "WIRE",
    POWER_WIRING,
    interconnection.top,
    interconnection.top + 60,
  );
  const wires = header
    ? tableRows(runs, header, header[0]!.top + 4, tableBottom).map(
        ([wire, fromBlock, fromPoint, toBlock, toPoint]): RawWire => ({
          wire: wire ?? null,
          colour: null,
          from: terminal(fromBlock, fromPoint),
          to: terminal(toBlock, toPoint),
        }),
      )
    : null;

  const jumperHeader = jumpersLabel
    ? tableHeader(runs, "JUMPER", POWER_JUMPERS, jumpersLabel.top, jumpersLabel.top + 60)
    : null;
  const jumpers = jumperHeader
    ? tableRows(runs, jumperHeader, jumperHeader[0]!.top + 4, bottom - 2).map(
        ([code, fromBlock, fromPoint, toBlock, toPoint]): RawJumper => ({
          code: code ?? null,
          from: terminal(fromBlock, fromPoint),
          to: terminal(toBlock, toPoint),
        }),
      )
    : [];

  const revision = rightOf(runs, interconnection, page.width)?.replace(/^R\.?\s*/i, "") || null;
  return { wires, jumpers, wiringRevision: revision };
}

function parsePowerSheet(page: PdfPage): RawCableSheet {
  const { runs, width, height } = page;
  const idLabel = findLabel(runs, "CABLE ID")!;
  const idLine = runs.filter(
    (run) => Math.abs(run.top - idLabel.top) < 3 && run.x0 > idLabel.x1 && run.x0 < width * 0.5,
  );
  const code = idLine.find((run) => compact(run.text) !== "")?.text ?? null;
  const altCode =
    runsIn(runs, {
      top: idLabel.top + 5,
      bottom: idLabel.top + 20,
      left: idLabel.x1,
      right: width * 0.5,
    })
      .map((run) => run.text)
      .join(" ") || null;
  const revision =
    runs
      .filter(
        (run) =>
          Math.abs(run.top - idLabel.top) < 4 && run.x0 > width * 0.6 && compact(run.text) !== "R",
      )
      .map((run) => run.text.replace(/^R\.\s*/, ""))
      .join(" ") || null;

  const service = findLabel(runs, "SERVICE", (box) => box.x0 < width * 0.3);
  const level = findLabel(runs, "SERVICE LEVEL");
  const length = findLabel(runs, "LENGTH");
  const type = findLabel(runs, "CABLE TYPE");
  const circuits = findLabel(runs, "NUM. OF CIRCT.");
  const perCircuit = findLabel(runs, "CAB. PER CIRCT.");
  const composition = findLabel(runs, "COMPOSITION");
  const route = findLabel(runs, "ROUT", (box) => box.x0 < width * 0.3);
  const observations = findLabel(runs, "Observations :") ?? findLabel(runs, "Observations") ?? null;

  let typeCode: string | null = null;
  let typeText: string | null = null;
  if (type && composition) {
    const typeRuns = runsIn(runs, {
      top: type.top + 3,
      bottom: composition.top - 3,
      right: circuits ? circuits.x0 - 10 : width * 0.55,
    });
    typeCode = typeRuns.find((run) => TYPE_CODE.test(run.text))?.text ?? null;
    typeText =
      typeRuns
        .filter((run) => run.text !== typeCode)
        .map((run) => run.text)
        .join(" ") || null;
  }

  const ends = readEnds(runs, [
    ["Equipment ID:", "equipment"],
    ["Cubicle:", "cubicle"],
    ["Function KKS:", "functionKks"],
    ["Installation KKS:", "installationKks"],
  ]);

  return {
    layout: "power",
    page: page.number,
    document: documentCode(page),
    code,
    footerCode: footerCode(page),
    altCode,
    revision,
    level: level ? below(runs, level) : null,
    length: length ? below(runs, length) : null,
    typeCode,
    typeText,
    service:
      service && type
        ? region(runs, {
            top: service.top + 3,
            bottom: type.top - 3,
            right: level ? level.x0 - 15 : width * 0.55,
          }).join(" ") || null
        : null,
    circuit: circuits ? below(runs, circuits) : null,
    cablesPerCircuit: perCircuit ? below(runs, perCircuit) : null,
    composition: composition ? below(runs, composition, { to: 20, pad: 5 }) : null,
    diagram: null,
    loop: null,
    ...ends,
    route: route
      ? readRoute(runs, route.top + 4, (observations?.top ?? height) - 2, width * 0.3)
      : [],
    observations: observations ? rightOf(runs, observations, width) : null,
    ...readPowerWiring(
      page,
      findLabel(runs, "INTERCONNECTION", (box) => box.x0 > width * 0.3),
      observations?.top ?? height,
    ),
  };
}

function parseInstrumentSheet(page: PdfPage): RawCableSheet {
  const { runs, width, height } = page;
  const idLabel = findLabel(runs, "CABLE ID")!;
  const loop = findLabel(runs, "LOOP");
  const revision = findLabel(runs, "REV.");
  const level = findLabel(runs, "LEVEL");
  const length = findLabel(runs, "LENGTH (m)") ?? findLabel(runs, "LENGTH");
  const type = findLabel(runs, "CABLE TYPE");
  const diagram = findLabel(runs, "DIAGRAM");
  const route = findLabel(runs, "ROUTING");
  const observations = findLabel(runs, "Observations :") ?? findLabel(runs, "Observations") ?? null;

  // The id may be on the label's line or a few lines below it, with the marking number under it.
  const idLines = lines(
    runsIn(runs, {
      top: idLabel.top - 2,
      bottom: (type?.top ?? idLabel.top + 40) - 2,
      left: idLabel.x1,
      right: width * 0.4,
    }),
  ).map((line) => line.map((run) => run.text).join(" "));

  const ends = readEnds(runs, [
    ["Equipment ID:", "equipment"],
    ["Gland:", "gland"],
    ["Location:", "location"],
  ]);

  return {
    layout: "instrument",
    page: page.number,
    document: documentCode(page),
    code: idLines[0] ?? null,
    footerCode: footerCode(page),
    altCode: idLines[1] ?? null,
    revision: revision ? rightOf(runs, revision, width) : null,
    level: level ? rightOf(runs, level, level.x1 + 30) : null,
    length: length ? rightOf(runs, length, width) : null,
    typeCode: null,
    typeText: type
      ? region(runs, {
          top: type.top + 3,
          bottom: (diagram?.top ?? type.top + 20) - 2,
          right: width * 0.6,
        }).join(" ") || null
      : null,
    service: null,
    circuit: null,
    cablesPerCircuit: null,
    composition: null,
    diagram: diagram ? below(runs, diagram, { to: 14, pad: 5 }) : null,
    loop: loop ? rightOf(runs, loop, width * 0.85) : null,
    ...ends,
    route: route
      ? readRoute(runs, route.top + 4, (observations?.top ?? height) - 2, width * 0.17)
      : [],
    observations: observations ? rightOf(runs, observations, width * 0.6) : null,
    wires: readInstrumentWiring(
      page,
      findLabel(runs, "INTERCONNECTION", (box) => box.x0 > width * 0.3),
      (observations?.top ?? height) - 2,
    ),
    jumpers: [],
    wiringRevision: null,
  };
}
