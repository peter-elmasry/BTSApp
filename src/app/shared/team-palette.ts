export interface TeamColour {
  name: string;
  hex: string;
}

/** The palette is configuration, while each team's saved HEX remains independent. */
export function normalizeTeamPalette(value: unknown): TeamColour[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const names = new Set<string>();
  const colours = new Set<string>();
  const result: TeamColour[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.name !== 'string' ||
      typeof item.hex !== 'string' ||
      Object.keys(item).some((key) => !['name', 'hex'].includes(key))
    )
      return null;
    const name = item.name.trim();
    const hex = item.hex.trim().toUpperCase();
    if (
      !name ||
      [...name].length > 40 ||
      !/^#[0-9A-F]{6}$/.test(hex) ||
      names.has(name.toLowerCase()) ||
      colours.has(hex)
    )
      return null;
    names.add(name.toLowerCase());
    colours.add(hex);
    result.push({ name, hex });
  }
  return result;
}
