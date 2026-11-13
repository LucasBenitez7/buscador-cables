/**
 * Deterministic sample data for development and performance tests, with the same shape as
 * the real project data (docs/DATOS-PROYECTO.md) but **invented**: unit "99", buildings
 * "UX*", "UY*", "UZ*", documents "EJ-…". About 4.500 cables of levels L1 to L4, the trays
 * they run through, their routes, both ends and a realistic mix of field statuses.
 *
 * Pure: it only builds plain objects (the seed script writes them), so the same seed always
 * produces the same data and it can be unit tested.
 */

export type LocationType = "PLANT" | "AREA" | "UNIT" | "SITE";
export type InstallationStatus = "IN_STOCK" | "COILED" | "PARTIALLY_LAID" | "LAID" | "RETIRED";
export type ConnectionStatus = "DISCONNECTED" | "ORIGIN_ONLY" | "DESTINATION_ONLY" | "CONNECTED";
export type CableLevel = "L1" | "L2" | "L3" | "L4";
export type TrayKind = "LADDER" | "GRID" | "SPECIAL" | "CONDUIT" | "DUCT" | "OTHER";
export type CableEndSide = "ORIGIN" | "DESTINATION";
export type RouteSection = "FIELD" | "ROOM";

export type SeedLocation = {
  id: string;
  name: string;
  code: string;
  type: LocationType;
  parentId: string | null;
  path: string;
};

export type SeedCatalogItem = { id: string; name: string; hex?: string };
export type SeedCableType = { id: string; name: string; code: string | null };

export type SeedTray = {
  id: string;
  code: string;
  kind: TrayKind;
  voltageLevel: number;
  elevationLevel: number;
  areaCode: string;
  locationId: string;
  widthMm: number | null;
  flangeHeightMm: number | null;
  bendRadiusMm: number | null;
  diameterMm: number | null;
};

export type SeedTrayDrawing = { trayId: string; drawing: string; sheet: string; title: string };

export type SeedRouteStep = {
  cableId: string;
  position: number;
  label: string;
  trayId: string | null;
  section: RouteSection | null;
};

export type SeedCable = {
  id: string;
  code: string;
  level: CableLevel;
  altCode: string | null;
  revision: string;
  description: string;
  typeId: string;
  conductors: number | null;
  crossSectionMm2: number | null;
  voltageRating: string | null;
  lengthM: number;
  lengthPending: boolean;
  circuit: string | null;
  cablesPerCircuit: number | null;
  composition: string | null;
  diagram: string | null;
  sourceDocument: string;
  sourcePage: number;
  originEquipment: string;
  originCubicle: string | null;
  originGland: string | null;
  originFunctionKks: string | null;
  originInstallationKks: string | null;
  originRoom: string | null;
  destinationEquipment: string;
  destinationCubicle: string | null;
  destinationGland: string | null;
  destinationFunctionKks: string | null;
  destinationInstallationKks: string | null;
  destinationRoom: string | null;
  originId: string;
  destinationId: string;
  currentLocationId: string | null;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  looseEnd: CableEndSide | null;
  looseEndTrayId: string | null;
  notes: string | null;
};

export type SeedData = {
  locations: SeedLocation[];
  cableTypes: SeedCableType[];
  colors: SeedCatalogItem[];
  manufacturers: SeedCatalogItem[];
  trays: SeedTray[];
  trayDrawings: SeedTrayDrawing[];
  cables: SeedCable[];
  routeSteps: SeedRouteStep[];
};

/** Small, fast, seedable PRNG (mulberry32). */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const chance = (probability: number) => next() < probability;
  /** Picks a key with probability proportional to its weight. */
  const weighted = <K extends string>(weights: Record<K, number>): K => {
    const entries = Object.entries(weights) as [K, number][];
    let roll = next() * entries.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll < 0) {
        return key;
      }
    }
    return entries[entries.length - 1]![0];
  };
  /** `count` distinct items in random order. */
  const sample = <T>(list: readonly T[], count: number): T[] => {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(next() * (index + 1));
      [copy[index], copy[other]] = [copy[other]!, copy[index]!];
    }
    return copy.slice(0, Math.min(count, copy.length));
  };
  return { next, pick, int, chance, weighted, sample };
}

type Random = ReturnType<typeof createRandom>;

const pad = (value: number, length: number) => String(value).padStart(length, "0");

// ---------------------------------------------------------------------------
// Locations: Planta (unidad) → Área (grupo de edificios) → Unidad (edificio) → Sitio (sala)
// ---------------------------------------------------------------------------

const UNIT = "99";
const PLANT = { code: UNIT, name: "Central de ejemplo" };

type BuildingSpec = {
  code: string;
  name: string;
  rooms: [suffix: string, name: string][];
  /** Voltage levels of its trays. */
  levels: number[];
};

const AREAS: { code: string; name: string; buildings: BuildingSpec[] }[] = [
  {
    code: "UX",
    name: "Edificios eléctricos",
    buildings: [
      {
        code: "UXA",
        name: "Edificio eléctrico principal",
        rooms: [
          ["16RA001", "Sala de celdas MT"],
          ["16RA002", "Sala de transformadores auxiliares"],
          ["23RA011", "Sala de cuadros BT"],
          ["23RA021", "Sala de baterías"],
        ],
        levels: [1, 2, 3, 4],
      },
      {
        code: "UXB",
        name: "Edificio de control",
        rooms: [
          ["23RA052", "Sala de armarios de control"],
          ["23RA053", "Sala de comunicaciones"],
          ["24RA001", "Sala de operación"],
        ],
        levels: [1, 2],
      },
    ],
  },
  {
    code: "UY",
    name: "Sala de máquinas",
    buildings: [
      {
        code: "UYA",
        name: "Nave de la turbina de gas",
        rooms: [
          ["15RA001", "Planta baja"],
          ["19RA022", "Plataforma de la turbina"],
        ],
        levels: [1, 2, 3, 4],
      },
      {
        code: "UYB",
        name: "Nave de la turbina de vapor",
        rooms: [
          ["15RA001", "Planta baja"],
          ["20RA023", "Plataforma del condensador"],
        ],
        levels: [1, 2, 4],
      },
      {
        code: "UYC",
        name: "Edificio de bombas",
        rooms: [["14RA001", "Sala de bombas"]],
        levels: [1, 2],
      },
    ],
  },
  {
    code: "UZ",
    name: "Exteriores",
    buildings: [
      {
        code: "UZA",
        name: "Rack de cables",
        rooms: [["00RA001", "Rack principal"]],
        levels: [1, 2, 3, 4],
      },
      {
        code: "UZB",
        name: "Galería enterrada",
        rooms: [["00RA001", "Galería norte"]],
        levels: [1, 2, 4],
      },
      {
        code: "UZC",
        name: "Caldera de recuperación",
        rooms: [
          ["15RA001", "Planta baja"],
          ["44RA001", "Plataforma superior"],
        ],
        levels: [1, 2],
      },
    ],
  },
];

const STORE = { area: "ALM", unit: "ALM", room: "00RA001", name: "Campa de bobinas" };

type Building = {
  code: string;
  name: string;
  location: SeedLocation;
  rooms: SeedLocation[];
  levels: number[];
};

function buildLocations() {
  const locations: SeedLocation[] = [];
  const add = (location: Omit<SeedLocation, "id" | "path">, parent: SeedLocation | null) => {
    const created: SeedLocation = {
      ...location,
      id: `seed-loc-${location.code}`,
      path: `${parent?.path ?? ""}/${location.code}`,
    };
    locations.push(created);
    return created;
  };

  const plant = add({ name: PLANT.name, code: PLANT.code, type: "PLANT", parentId: null }, null);
  const buildings = new Map<string, Building>();
  for (const areaSpec of AREAS) {
    const area = add(
      { name: areaSpec.name, code: `${UNIT}${areaSpec.code}`, type: "AREA", parentId: plant.id },
      plant,
    );
    for (const spec of areaSpec.buildings) {
      const code = `${UNIT}${spec.code}`;
      const unit = add({ name: spec.name, code, type: "UNIT", parentId: area.id }, area);
      const rooms = spec.rooms.map(([suffix, name]) =>
        add({ name, code: `${code}${suffix}`, type: "SITE", parentId: unit.id }, unit),
      );
      buildings.set(spec.code, {
        code,
        name: spec.name,
        location: unit,
        rooms,
        levels: spec.levels,
      });
    }
  }

  const storeArea = add(
    { name: "Almacén de obra", code: `${UNIT}${STORE.area}`, type: "AREA", parentId: plant.id },
    plant,
  );
  const storeUnit = add(
    {
      name: "Almacén",
      code: `${UNIT}${STORE.unit}-1`,
      type: "UNIT",
      parentId: storeArea.id,
    },
    storeArea,
  );
  const store = add(
    {
      name: STORE.name,
      code: `${UNIT}${STORE.unit}${STORE.room}`,
      type: "SITE",
      parentId: storeUnit.id,
    },
    storeUnit,
  );
  return { locations, buildings, store };
}

// ---------------------------------------------------------------------------
// Trays: "99UXA00L22036" = building · sub-zone · kind · voltage level · elevation · number
// ---------------------------------------------------------------------------

const LADDERS_PER_LEVEL_AND_ELEVATION = 6;
const LADDER_WIDTH_BY_LEVEL: Record<number, number[]> = {
  1: [200, 300],
  2: [400, 600],
  3: [600, 800],
  4: [800],
};

function buildTrays(buildings: Map<string, Building>, random: Random) {
  const trays: SeedTray[] = [];
  const drawings: SeedTrayDrawing[] = [];
  /** Ladder and grid trays of each building, by voltage level, to build routes. */
  const byBuilding = new Map<string, Map<number, SeedTray[]>>();
  const add = (tray: Omit<SeedTray, "id">, building: Building, drawing: SeedTrayDrawing) => {
    const created = { ...tray, id: `seed-tray-${tray.code}` };
    trays.push(created);
    drawings.push({ ...drawing, trayId: created.id });
    return created;
  };

  [...buildings.values()].forEach((building, buildingIndex) => {
    const levels = new Map<number, SeedTray[]>();
    byBuilding.set(building.code, levels);
    for (const voltageLevel of building.levels) {
      const list: SeedTray[] = [];
      levels.set(voltageLevel, list);
      // Instrumentation has its own drawing with one sheet per building; power, one per level.
      const drawing =
        voltageLevel === 1
          ? {
              drawing: "EJ-ICO-DRW-0001",
              sheet: pad(buildingIndex + 3, 2),
              title: `${building.name} · bandejas de instrumentación`,
            }
          : {
              drawing: `EJ-ELE-DRW-${pad(21 + buildingIndex, 4)}`,
              sheet: pad(voltageLevel, 2),
              title: `${building.name} · bandejas L${voltageLevel}`,
            };
      for (let elevation = 0; elevation <= 2; elevation += 1) {
        for (let index = 1; index <= LADDERS_PER_LEVEL_AND_ELEVATION; index += 1) {
          const number = elevation * 20 + index;
          const isGrid = voltageLevel === 1 && random.chance(0.3);
          const kindLetter = isGrid ? "W" : "L";
          const widthMm = random.pick(LADDER_WIDTH_BY_LEVEL[voltageLevel]!);
          list.push(
            add(
              {
                code: `${building.code}00${kindLetter}${voltageLevel}${elevation}${pad(number, 3)}`,
                kind: isGrid ? "GRID" : "LADDER",
                voltageLevel,
                elevationLevel: elevation,
                areaCode: building.code,
                locationId: building.location.id,
                widthMm,
                flangeHeightMm: isGrid ? 60 : 100,
                bendRadiusMm: isGrid ? null : widthMm >= 600 ? 600 : 300,
                diameterMm: null,
              },
              building,
              { ...drawing, trayId: "" },
            ),
          );
        }
      }
      // A few conduits for the last metres to the equipment (L1 and L2).
      if (voltageLevel <= 2) {
        for (let index = 1; index <= 4; index += 1) {
          add(
            {
              code: `${building.code}00C${voltageLevel}0${pad(100 + index, 3)}`,
              kind: "CONDUIT",
              voltageLevel,
              elevationLevel: 0,
              areaCode: building.code,
              locationId: building.location.id,
              widthMm: null,
              flangeHeightMm: null,
              bendRadiusMm: null,
              diameterMm: random.pick([25, 32, 40]),
            },
            building,
            { ...drawing, trayId: "" },
          );
        }
      }
    }
  });

  // Buried ducts of the gallery, with the "_2" sub-zone of the codification.
  const gallery = buildings.get("UZB")!;
  const ducts = new Map<number, SeedTray[]>();
  for (const voltageLevel of gallery.levels) {
    const list: SeedTray[] = [];
    for (let index = 1; index <= 6; index += 1) {
      list.push(
        add(
          {
            code: `${gallery.code}_2D${voltageLevel}${index % 3}${pad(50 + index, 3)}`,
            kind: "DUCT",
            voltageLevel,
            elevationLevel: index % 3,
            areaCode: gallery.code,
            locationId: gallery.location.id,
            widthMm: null,
            flangeHeightMm: null,
            bendRadiusMm: null,
            diameterMm: 160,
          },
          gallery,
          {
            trayId: "",
            drawing: "EJ-ELE-DRW-0030",
            sheet: "02",
            title: "Canalizaciones enterradas",
          },
        ),
      );
    }
    ducts.set(voltageLevel, list);
  }
  return { trays, drawings, byBuilding, ducts };
}

// ---------------------------------------------------------------------------
// Cable types, systems and equipment
// ---------------------------------------------------------------------------

type TypeSpec = {
  key: string;
  code: string | null;
  name: string;
  conductors: number | null;
  section: number | null;
  voltage: string | null;
  composition: string | null;
};

const POWER_TYPES: Record<"L2" | "L3" | "L4", TypeSpec[]> = {
  L2: [
    spec("Q0825", "0,6/1 KV 8X2.5 MM2 CU", 8, 2.5, "CONTROL"),
    spec("Q1225", "0,6/1 KV 12X2.5 MM2 CU", 12, 2.5, "CONTROL"),
    spec("Q0415", "0,6/1 KV 4X1.5 MM2 CU", 4, 1.5, "CONTROL"),
    spec("P0325", "0,6/1 KV 3X2,5MM2 CU", 3, 2.5, "PH+N+PE"),
    spec("P0460", "0,6/1 KV 4X6MM2 CU", 4, 6, "3PH+PE"),
    spec("P0416", "0,6/1 KV 4X16MM2 CU", 4, 16, "3PH+N"),
    spec("P0595", "0,6/1 KV 5X95MM2 CU", 5, 95, "3PH+N+PE"),
    spec("P0260", "0,6/1 KV 2X6MM2 CU", 2, 6, "DC"),
  ],
  L3: [
    spec("U1240", "0,6/1 KV 1X240MM2 CU", 1, 240, "3PH"),
    spec("U1400", "0,6/1 KV 1X400MM2 CU", 1, 400, "3PH"),
  ],
  L4: [
    spec("V1240", "12/20KV 1X240MM2 CU", 1, 240, "3PH", "12/20 kV"),
    spec("V1400", "12/20KV 1X400MM2 CU", 1, 400, "3PH", "12/20 kV"),
  ],
};

const INSTRUMENT_TYPES: TypeSpec[] = [
  instrument("JE-Y(St)Y BD Si FR 1 x 2 x 0,8mm", 2, 0.5),
  instrument("JE-Y(St)Y BD Si FR 4 x 2 x 0,8mm", 8, 0.5),
  instrument("JE-Y(St)Y BD Si FR 8 x 2 x 0,8mm", 16, 0.5),
  instrument("LiYCY 2 x 2 x 1,5 mm2", 4, 1.5),
  instrument("Termopar tipo K 1 x 2 x 1,5 mm2", 2, 1.5),
  instrument("LAN CAT. 7 S/FTP 4x(2x23AWG+S)+S", null, null),
  instrument("Fibra óptica monomodo 12 fibras 9/125", null, null),
];

function spec(
  code: string,
  name: string,
  conductors: number,
  section: number,
  composition: string,
  voltage = "0,6/1 kV",
): TypeSpec {
  return { key: code.toLowerCase(), code, name, conductors, section, voltage, composition };
}

function instrument(name: string, conductors: number | null, section: number | null): TypeSpec {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return { key, code: null, name, conductors, section, voltage: null, composition: null };
}

/** Process systems (invented KKS) and the building where their equipment is. */
const PROCESS_SYSTEMS = [
  { system: "99XAB10", name: "bomba de alimentación 1", building: "UYC" },
  { system: "99XAB20", name: "bomba de alimentación 2", building: "UYC" },
  { system: "99XAC10", name: "condensado", building: "UYB" },
  { system: "99XHA10", name: "turbina de gas", building: "UYA" },
  { system: "99XHA20", name: "aceite de lubricación", building: "UYA" },
  { system: "99XMB30", name: "turbina de vapor", building: "UYB" },
  { system: "99XLB10", name: "caldera de recuperación", building: "UZC" },
  { system: "99XLB20", name: "desgasificador", building: "UZC" },
] as const;

/** Switchgear and motor control centres in the electrical building. */
const PANELS = [
  { equipment: "99BXA", name: "celdas MT 10 kV", room: "16RA001", levels: ["L4"] },
  { equipment: "99BXB", name: "celdas MT de servicios", room: "16RA001", levels: ["L3", "L4"] },
  { equipment: "99BMA", name: "CCM de servicios generales", room: "23RA011", levels: ["L2", "L3"] },
  { equipment: "99BMB", name: "CCM de la isla de potencia", room: "23RA011", levels: ["L2"] },
  { equipment: "99BTA", name: "cuadro de corriente continua", room: "23RA021", levels: ["L2"] },
] as const;

/** Instrument cabinets in the control building. */
const CABINETS = [
  { equipment: "99CXJ11", room: "23RA052" },
  { equipment: "99CXJ12", room: "23RA052" },
  { equipment: "99CXP11", room: "23RA052" },
  { equipment: "99CXK10", room: "23RA053" },
] as const;

const INSTRUMENT_KINDS = [
  { letter: "T", name: "temperatura" },
  { letter: "P", name: "presión" },
  { letter: "F", name: "caudal" },
  { letter: "L", name: "nivel" },
  { letter: "A", name: "análisis" },
] as const;

const CONSUMERS = [
  { suffix: "AP", name: "motor" },
  { suffix: "AA", name: "válvula motorizada" },
  { suffix: "AN", name: "ventilador" },
  { suffix: "GH", name: "caja de bornas" },
] as const;

const OBSERVATIONS = [
  "Pantalla conectada a tierra en ambos extremos",
  "Suministro y tendido por el fabricante del equipo",
  "Comprobar longitud en campo antes de cortar",
];

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateSeedData(options: { cables?: number; seed?: number } = {}): SeedData {
  const total = options.cables ?? 4500;
  const random = createRandom(options.seed ?? 20261113);
  const { locations, buildings, store } = buildLocations();
  const { trays, drawings, byBuilding, ducts } = buildTrays(buildings, random);

  const allTypes = [...INSTRUMENT_TYPES, ...Object.values(POWER_TYPES).flat()];
  const cableTypes: SeedCableType[] = allTypes.map((type) => ({
    id: `seed-type-${type.key}`,
    name: type.name,
    code: type.code,
  }));
  const colors = COLORS.map((color) => ({ id: `seed-color-${slug(color.name)}`, ...color }));
  const manufacturers = MANUFACTURERS.map((name) => ({ id: `seed-mfr-${slug(name)}`, name }));

  const room = (buildingCode: string, suffix?: string) => {
    const building = buildings.get(buildingCode)!;
    return suffix
      ? building.rooms.find((site) => site.code === `${building.code}${suffix}`)!
      : random.pick(building.rooms);
  };

  const cables: SeedCable[] = [];
  const routeSteps: SeedRouteStep[] = [];
  const used = new Set<string>();
  const counters = new Map<string, number>();
  const nextNumber = (key: string) => {
    const value = (counters.get(key) ?? 0) + 1;
    counters.set(key, value);
    return value;
  };
  const pages = new Map<string, number>();
  const nextPage = (document: string) => {
    const value = (pages.get(document) ?? 3) + 1;
    pages.set(document, value);
    return value;
  };

  /** Trays from one building to another, through the rack or the gallery. */
  const planRoute = (from: string, to: string, level: number) => {
    const inBuilding = (code: string, count: number) =>
      random.sample(byBuilding.get(`${UNIT}${code}`)?.get(level) ?? [], count);
    const start = inBuilding(from, random.int(1, 4));
    if (from === to) return { field: start, room: [] as SeedTray[] };
    const throughGallery = random.chance(0.25) && ducts.has(level);
    const middle = throughGallery
      ? random.sample(ducts.get(level)!, random.int(2, 4))
      : inBuilding("UZA", random.int(2, 6));
    const end = inBuilding(to, random.int(1, 4));
    return { field: [...start, ...middle], room: end };
  };

  while (cables.length < total) {
    const level = random.weighted<CableLevel>({ L1: 58, L2: 36, L3: 1.5, L4: 3 });
    const group = level === "L3" ? random.int(2, 4) : 1;
    if (level === "L1") {
      addInstrumentCable();
    } else {
      addPowerCables(level, group);
    }
  }

  function addInstrumentCable() {
    const process = random.pick(PROCESS_SYSTEMS);
    const kind = random.pick(INSTRUMENT_KINDS);
    const loopNumber = nextNumber(`${process.system}${kind.letter}`);
    const instrumentTag = `${process.system}C${kind.letter}${pad(loopNumber, 3)}`;
    const code = `${process.system}${kind.letter}${(loopNumber % 9) + 1}-W8${pad(loopNumber, 3)}`;
    if (used.has(code)) return;
    used.add(code);

    const type = random.pick(INSTRUMENT_TYPES);
    // Some cables stay local: from a junction box to the instrument, in the same room.
    const local = random.chance(0.4);
    const originRoom = room(process.building);
    const cabinet = random.pick(CABINETS);
    const destinationRoom = local ? originRoom : room("UXB", cabinet.room);
    const destinationEquipment = local
      ? `${process.system}CX${pad(loopNumber % 4, 3)}`
      : cabinet.equipment;
    const route = local ? { field: [], room: [] } : planRoute(process.building, "UXB", 1);
    const document = `EJ-ICO-LST-${pad(100 + PROCESS_SYSTEMS.indexOf(process), 4)}`;

    pushCable(
      {
        code,
        level: "L1",
        altCode: random.chance(0.2) ? `${UNIT} CBLM-${pad(random.int(1, 9999), 4)}` : null,
        revision: random.pick(["01", "02", "03"]),
        description: `Señal de ${kind.name} ${instrumentTag}`,
        type,
        circuit: null,
        cablesPerCircuit: null,
        diagram: `EJ-ICO-DIA-${pad(100 + PROCESS_SYSTEMS.indexOf(process), 4)}_${pad(random.int(1, 40), 3)}`,
        sourceDocument: document,
        originEquipment: instrumentTag,
        originCubicle: null,
        originGland: random.pick(["M-20", "M-20ARM", "M-25ARM"]),
        originFunctionKks: null,
        originInstallationKks: null,
        originRoom: originRoom.code,
        destinationEquipment,
        destinationCubicle: null,
        destinationGland: random.pick(["M-20", "M-20ARM"]),
        destinationFunctionKks: null,
        destinationInstallationKks: null,
        destinationRoom: destinationRoom.code,
        originId: originRoom.id,
        destinationId: destinationRoom.id,
      },
      [
        ...route.field.map((tray) => ({ tray, section: "FIELD" as const })),
        ...route.room.map((tray) => ({ tray, section: "ROOM" as const })),
      ],
      local ? random.int(3, 25) : 0,
    );
  }

  function addPowerCables(level: "L2" | "L3" | "L4", count: number) {
    const panel = random.pick(
      PANELS.filter((candidate) => (candidate.levels as readonly string[]).includes(level)),
    );
    const process = random.pick(PROCESS_SYSTEMS);
    const consumer = random.pick(CONSUMERS);
    const consumerTag = `${process.system}${consumer.suffix}${pad(random.int(1, 30), 3)}`;
    const type = random.pick(POWER_TYPES[level]);
    const voltageDigit = level === "L2" ? 2 : 1;
    const originRoom = room("UXA", panel.room);
    const destinationRoom = room(process.building);
    const route = planRoute("UXA", process.building, Number(level[1]));
    const steps = [...route.field, ...route.room].map((tray) => ({ tray, section: null }));
    // Now and then the list names a stretch that is not a tray.
    const labels: { tray: SeedTray | null; label?: string; section: null }[] = [...steps];
    if (random.chance(0.05)) {
      labels.splice(random.int(0, labels.length), 0, {
        tray: null,
        label: random.pick(["CONTIGUOUS PANEL", "TRAM. VERTICAL"]),
        section: null,
      });
    }
    const cubicle = level === "L2" ? null : `H${pad(random.int(1, 12), 2)}`;
    const document = `EJ-ELE-LST-${pad(11 + PANELS.indexOf(panel), 4)}`;
    const description =
      type.composition === "CONTROL"
        ? `MANDO Y SEÑALIZACIÓN ${consumer.name.toUpperCase()} ${consumerTag}`
        : `ALIMENTACIÓN ${consumer.name.toUpperCase()} ${consumerTag}`;

    for (let index = 1; index <= count; index += 1) {
      const number = nextNumber(`${process.system}W${voltageDigit}`);
      const code = `${process.system}W${voltageDigit}${pad(number, 3)}`;
      if (used.has(code)) continue;
      used.add(code);
      pushCable(
        {
          code,
          level,
          altCode: random.chance(0.25) ? `${UNIT} CBLC-${pad(random.int(1, 9999), 4)}` : null,
          revision: random.pick(["0", "1", "2", "3", "2_RX00", "3_RX01"]),
          description,
          type,
          circuit: count > 1 ? `${index} de ${count}` : null,
          cablesPerCircuit: count > 1 ? 3 : 1,
          diagram: null,
          sourceDocument: document,
          originEquipment: panel.equipment,
          originCubicle: cubicle,
          originGland: null,
          originFunctionKks: `=${panel.equipment}00GS101`,
          originInstallationKks: `+${panel.equipment}01`,
          originRoom: null,
          destinationEquipment: consumerTag,
          destinationCubicle: null,
          destinationGland: null,
          destinationFunctionKks: null,
          destinationInstallationKks: null,
          destinationRoom: null,
          originId: originRoom.id,
          destinationId: destinationRoom.id,
        },
        labels,
        0,
      );
    }
  }

  type CableBase = Omit<
    SeedCable,
    | "id"
    | "typeId"
    | "conductors"
    | "crossSectionMm2"
    | "voltageRating"
    | "composition"
    | "lengthM"
    | "lengthPending"
    | "sourcePage"
    | "currentLocationId"
    | "installationStatus"
    | "connectionStatus"
    | "looseEnd"
    | "looseEndTrayId"
    | "notes"
  > & { type: TypeSpec };

  function pushCable(
    base: CableBase,
    route: { tray: SeedTray | null; label?: string; section: RouteSection | null }[],
    localLength: number,
  ) {
    const { type, ...fields } = base;
    const id = `seed-cable-${pad(cables.length + 1, 5)}`;
    route.forEach((step, index) => {
      routeSteps.push({
        cableId: id,
        position: index + 1,
        label: step.tray?.code ?? step.label!,
        trayId: step.tray?.id ?? null,
        section: step.section,
      });
    });

    const routeTrays = route.flatMap((step) => (step.tray ? [step.tray] : []));
    const status = random.weighted<InstallationStatus>({
      LAID: 45,
      PARTIALLY_LAID: routeTrays.length > 0 ? 12 : 0,
      COILED: 10,
      IN_STOCK: 30,
      RETIRED: 3,
    });
    let connectionStatus: ConnectionStatus = "DISCONNECTED";
    let looseEnd: CableEndSide | null = null;
    let looseEndTrayId: string | null = null;
    if (status === "LAID") {
      connectionStatus = random.weighted<ConnectionStatus>({
        CONNECTED: 60,
        ORIGIN_ONLY: 15,
        DESTINATION_ONLY: 10,
        DISCONNECTED: 15,
      });
    }
    if (status === "PARTIALLY_LAID") {
      // Usually the panel end is done and the equipment end waits for the equipment.
      looseEnd = random.chance(0.8) ? "DESTINATION" : "ORIGIN";
      looseEndTrayId = random.pick(routeTrays).id;
      if (random.chance(0.5)) {
        connectionStatus = looseEnd === "DESTINATION" ? "ORIGIN_ONLY" : "DESTINATION_ONLY";
      }
    }
    const currentLocationId =
      status === "IN_STOCK"
        ? store.id
        : status === "COILED"
          ? random.pick([base.originId, base.destinationId, store.id])
          : null;

    const lengthM =
      localLength > 0
        ? localLength
        : Math.max(8, routeTrays.length * random.int(6, 14) + random.int(5, 30));
    cables.push({
      ...fields,
      id,
      typeId: `seed-type-${type.key}`,
      conductors: type.conductors,
      crossSectionMm2: type.section,
      voltageRating: type.voltage,
      composition: type.composition,
      lengthM,
      lengthPending: base.level !== "L1" && random.chance(0.015),
      sourcePage: nextPage(base.sourceDocument),
      currentLocationId,
      installationStatus: status,
      connectionStatus,
      looseEnd,
      looseEndTrayId,
      notes: random.chance(0.1) ? random.pick(OBSERVATIONS) : null,
    });
  }

  return {
    locations,
    cableTypes,
    colors,
    manufacturers,
    trays,
    trayDrawings: drawings,
    cables,
    routeSteps,
  };
}

// The project lists bring no colour or manufacturer; the catalogs stay for manual cables.
const COLORS = [
  { name: "Negro", hex: "#1C1C1C" },
  { name: "Gris", hex: "#8E9196" },
  { name: "Azul", hex: "#2E6DB4" },
  { name: "Rojo", hex: "#C0392B" },
  { name: "Verde-amarillo", hex: "#9ACD32" },
] as const;

const MANUFACTURERS = ["Fabricante A", "Fabricante B", "Fabricante C"] as const;

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
