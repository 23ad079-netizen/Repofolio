/**
 * Deterministic folder-tab color from a curated set of muted hues.
 * Same folder name always produces the same color — like color-coded
 * tabs in a physical filing cabinet.
 */

const TAB_HUES = [
  "#8B7355", // warm taupe
  "#6B8F71", // moss
  "#7B8FA1", // slate blue
  "#A0785A", // sienna
  "#8A7B9B", // muted plum
  "#6F8B7B", // sage
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function folderTabColor(name: string): string {
  return TAB_HUES[hashString(name) % TAB_HUES.length];
}
