/**
 * Deterministic sample data for development and performance tests:
 * two plants with areas, units and sites, the catalogs, and ~5.000 cables.
 *
 * Pure: it only builds plain objects (the seed script writes them), so the
 * same seed always produces the same data and it can be unit tested.
 */

export type LocationType = "PLANT" | "AREA" | "UNIT" | "SITE";
export type InstallationStatus = "IN_STOCK" | "COILED" | "LAID" | "RETIRED";
export type ConnectionStatus = "DISCONNECTED" | "ORIGIN_ONLY" | "DESTINATION_ONLY" | "CONNECTED";

export type SeedLocation = {
  id: string;
  name: string;
  code: string;
  type: LocationType;
  parentId: string | null;
  path: string;
};

export type SeedCatalogItem = { id: string; name: string; hex?: string };

export type SeedCable = {
  code: string;
  description: string;
  typeId: string;
  colorId: string;
  manufacturerId: string;
  conductors: number;
  crossSectionMm2: number;
  outerDiameterMm: number;
  lengthM: number;
  voltageRating: string;
  originId: string;
  destinationId: string;
  currentLocationId: string | null;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
};

export type SeedData = {
  locations: SeedLocation[];
  cableTypes: SeedCatalogItem[];
  colors: SeedCatalogItem[];
  manufacturers: SeedCatalogItem[];
  cables: SeedCable[];
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
  const between = (min: number, max: number) => min + next() * (max - min);
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
  return { next, pick, between, weighted };
}

const PLANTS = [
  {
    code: "CTN",
    name: "Central Térmica Norte",
    areas: [
      { code: "CAL", name: "Calderas", units: ["Caldera 1", "Caldera 2", "Caldera auxiliar"] },
      {
        code: "TUR",
        name: "Turbinas",
        units: ["Turbina de vapor", "Turbina de gas", "Condensador"],
      },
      {
        code: "SUB",
        name: "Subestación",
        units: ["Transformador principal", "Celdas MT", "Celdas BT"],
      },
      {
        code: "TRA",
        name: "Tratamiento de agua",
        units: ["Desmineralizadora", "Torre de refrigeración"],
      },
    ],
  },
  {
    code: "PQS",
    name: "Planta Química Sur",
    areas: [
      { code: "REA", name: "Reactores", units: ["Reactor X", "Reactor Y", "Reactor Z"] },
      { code: "DES", name: "Destilación", units: ["Columna C-101", "Columna C-102"] },
      {
        code: "UTL",
        name: "Servicios auxiliares",
        units: ["Compresores", "Bombas de proceso", "Sala de control"],
      },
    ],
  },
] as const;

const SITES_PER_UNIT = ["Bandeja norte", "Bandeja sur", "Armario local", "Caja de conexiones"];
const WAREHOUSE = { code: "LOG", name: "Logística", unit: "Almacén", site: "Almacén general" };

const CABLE_TYPES = [
  { key: "power", name: "Potencia", prefix: "PW", voltage: "0,6/1 kV", weight: 30 },
  { key: "control", name: "Control", prefix: "SH", voltage: "300/500 V", weight: 30 },
  {
    key: "instrumentation",
    name: "Instrumentación",
    prefix: "IN",
    voltage: "300/500 V",
    weight: 20,
  },
  { key: "comms", name: "Comunicaciones", prefix: "CM", voltage: "300 V", weight: 8 },
  { key: "fiber", name: "Fibra óptica", prefix: "FO", voltage: "—", weight: 6 },
  { key: "earth", name: "Tierra", prefix: "TE", voltage: "0,6/1 kV", weight: 6 },
] as const;

const COLORS = [
  { name: "Negro", hex: "#1C1C1C" },
  { name: "Gris", hex: "#8E9196" },
  { name: "Azul", hex: "#2E6DB4" },
  { name: "Marrón", hex: "#7B4A2A" },
  { name: "Rojo", hex: "#C0392B" },
  { name: "Naranja", hex: "#E67E22" },
  { name: "Verde-amarillo", hex: "#9ACD32" },
] as const;

const MANUFACTURERS = ["Prysmian", "Nexans", "General Cable", "Top Cable", "Cablel"] as const;

const SECTIONS_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];
const CONDUCTORS = [1, 2, 3, 4, 5, 7, 12, 19, 24];

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function buildLocations(): {
  locations: SeedLocation[];
  sites: SeedLocation[];
  warehouses: SeedLocation[];
} {
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

  const sites: SeedLocation[] = [];
  const warehouses: SeedLocation[] = [];
  for (const plantSpec of PLANTS) {
    const plant = add(
      { name: plantSpec.name, code: plantSpec.code, type: "PLANT", parentId: null },
      null,
    );
    for (const areaSpec of plantSpec.areas) {
      const areaCode = `${plant.code}-${areaSpec.code}`;
      const area = add(
        { name: areaSpec.name, code: areaCode, type: "AREA", parentId: plant.id },
        plant,
      );
      areaSpec.units.forEach((unitName, unitIndex) => {
        const unitCode = `${areaCode}-U${unitIndex + 1}`;
        const unit = add({ name: unitName, code: unitCode, type: "UNIT", parentId: area.id }, area);
        SITES_PER_UNIT.forEach((siteName, siteIndex) => {
          sites.push(
            add(
              {
                name: siteName,
                code: `${unitCode}-S${siteIndex + 1}`,
                type: "SITE",
                parentId: unit.id,
              },
              unit,
            ),
          );
        });
      });
    }
    const logistics = add(
      {
        name: WAREHOUSE.name,
        code: `${plant.code}-${WAREHOUSE.code}`,
        type: "AREA",
        parentId: plant.id,
      },
      plant,
    );
    const store = add(
      { name: WAREHOUSE.unit, code: `${logistics.code}-ALM`, type: "UNIT", parentId: logistics.id },
      logistics,
    );
    warehouses.push(
      add(
        { name: WAREHOUSE.site, code: `${store.code}-GEN`, type: "SITE", parentId: store.id },
        store,
      ),
    );
  }
  return { locations, sites, warehouses };
}

export function generateSeedData(options: { cables?: number; seed?: number } = {}): SeedData {
  const total = options.cables ?? 5000;
  const random = createRandom(options.seed ?? 20261110);
  const { locations, sites, warehouses } = buildLocations();

  const cableTypes = CABLE_TYPES.map((type) => ({ id: `seed-type-${type.key}`, name: type.name }));
  const colors = COLORS.map((color) => ({ id: `seed-color-${slug(color.name)}`, ...color }));
  const manufacturers = MANUFACTURERS.map((name) => ({ id: `seed-mfr-${slug(name)}`, name }));

  const typeWeights = Object.fromEntries(
    CABLE_TYPES.map((type) => [type.key, type.weight]),
  ) as Record<(typeof CABLE_TYPES)[number]["key"], number>;
  const counters = new Map<string, number>();
  const cables: SeedCable[] = [];

  for (let index = 0; index < total; index += 1) {
    const typeKey = random.weighted(typeWeights);
    const type = CABLE_TYPES.find((candidate) => candidate.key === typeKey)!;
    const number = (counters.get(type.prefix) ?? 0) + 1;
    counters.set(type.prefix, number);

    const origin = random.pick(sites);
    // El destino suele estar en la misma planta (mismo primer segmento de la ruta).
    const plantPrefix = origin.path.split("/")[1];
    const samePlant = sites.filter(
      (site) => site.id !== origin.id && site.path.split("/")[1] === plantPrefix,
    );
    const destination = random.pick(samePlant);

    const installationStatus = random.weighted<InstallationStatus>({
      LAID: 60,
      COILED: 15,
      IN_STOCK: 20,
      RETIRED: 5,
    });
    const connectionStatus: ConnectionStatus =
      installationStatus === "LAID"
        ? random.weighted<ConnectionStatus>({
            CONNECTED: 60,
            ORIGIN_ONLY: 15,
            DESTINATION_ONLY: 10,
            DISCONNECTED: 15,
          })
        : "DISCONNECTED";
    const plantWarehouse = warehouses.find((site) => site.path.startsWith(`/${plantPrefix}/`))!;
    const currentLocationId =
      installationStatus === "IN_STOCK"
        ? plantWarehouse.id
        : installationStatus === "COILED"
          ? random.pick([origin.id, destination.id, plantWarehouse.id])
          : null;

    const isFiber = type.key === "fiber";
    const conductors = isFiber ? random.pick([4, 8, 12, 24]) : random.pick(CONDUCTORS);
    const crossSectionMm2 = isFiber ? 0 : random.pick(SECTIONS_MM2);
    const outerDiameterMm =
      Math.round((6 + Math.sqrt(crossSectionMm2 * conductors) * 1.6) * 10) / 10;

    cables.push({
      code: `${type.prefix}-${number}`,
      description: `${type.name} ${origin.name.toLowerCase()} → ${destination.name.toLowerCase()}`,
      typeId: `seed-type-${type.key}`,
      colorId: random.pick(colors).id,
      manufacturerId: random.pick(manufacturers).id,
      conductors,
      crossSectionMm2,
      outerDiameterMm,
      lengthM: Math.round(random.between(5, 800) * 10) / 10,
      voltageRating: type.voltage,
      originId: origin.id,
      destinationId: destination.id,
      currentLocationId,
      installationStatus,
      connectionStatus,
    });
  }

  return { locations, cableTypes, colors, manufacturers, cables };
}
