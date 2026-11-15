/**
 * KKS codes of buildings and rooms, as the project lists print them. They give the location
 * tree of the real data: plant (unit "99") → building group ("99UX") → building ("99UXA") →
 * room ("99UXA16RA001"). See docs/DATOS-PROYECTO.md.
 */

export type ParsedBuildingCode = {
  /** "99" */
  unit: string;
  /** "99UX": the first two letters of the building code. */
  groupCode: string;
  /** "99UXA" */
  buildingCode: string;
};

export type ParsedRoomCode = ParsedBuildingCode & {
  /** "99UXA16RA001" */
  code: string;
  /** "16RA001": floor and room number inside the building. */
  room: string;
};

const BUILDING = /^(\d{2})(U[A-Z])([A-Z])$/;
const ROOM = /^(\d{2})(U[A-Z])([A-Z])(\d{1,2}[A-Z]{1,2}\d{3})$/;

const normalize = (input: string) => input.trim().toUpperCase().replace(/\s+/g, "");

/** "99UXA" → its unit, group and building; null if it is not a building code. */
export function parseBuildingCode(input: string): ParsedBuildingCode | null {
  const match = BUILDING.exec(normalize(input));
  if (!match) return null;
  const [, unit, group, letter] = match;
  return { unit: unit!, groupCode: `${unit}${group}`, buildingCode: `${unit}${group}${letter}` };
}

/** "99UXA16RA001" → its unit, group, building and room; null if it is not a room code. */
export function parseRoomCode(input: string): ParsedRoomCode | null {
  const code = normalize(input);
  const match = ROOM.exec(code);
  if (!match) return null;
  const [, unit, group, letter, room] = match;
  return {
    code,
    unit: unit!,
    groupCode: `${unit}${group}`,
    buildingCode: `${unit}${group}${letter}`,
    room: room!,
  };
}
