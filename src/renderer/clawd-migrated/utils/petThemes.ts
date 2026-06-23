import type { CompanionSettings, PetThemeId } from "../../shared/events";

export type PetThemeDefinition = {
  id: PetThemeId;
  characterName: string;
  displayName: string;
  subtitle: string;
  interfaceTheme: "pet" | Extract<CompanionSettings["theme"], "light" | "dark">;
};

export const petThemes: PetThemeDefinition[] = [
  {
    id: "minato-aqua",
    characterName: "Aqua",
    displayName: "Minato Aqua",
    subtitle: "Aqua workbench",
    interfaceTheme: "pet"
  }
];

function normalizePetThemeId(value: unknown): PetThemeId {
  return value === "minato-aqua" ? value : "minato-aqua";
}

export function getPetTheme(value: unknown): PetThemeDefinition {
  const id = normalizePetThemeId(value);
  return petThemes.find(theme => theme.id === id) ?? petThemes[0];
}
