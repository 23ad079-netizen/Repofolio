type FolderRow = { id: string; parentId: string | null };

// Would moving `movingId` under `targetParentId` create a cycle
// (i.e. is the target the folder itself, or one of its own descendants)?
export function wouldCreateCycle(
  folders: FolderRow[],
  movingId: string,
  targetParentId: string | null
): boolean {
  if (targetParentId === null) return false;
  if (movingId === targetParentId) return true;
  const byId = Object.fromEntries(folders.map((f) => [f.id, f]));
  let cur: FolderRow | undefined = byId[targetParentId];
  while (cur) {
    if (cur.id === movingId) return true;
    cur = cur.parentId ? byId[cur.parentId] : undefined;
  }
  return false;
}
