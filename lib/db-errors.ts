export function isActiveRunConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { code?: string; message?: string; cause?: unknown };
  if (
    value.code === "SQLITE_CONSTRAINT_UNIQUE" &&
    value.message?.includes("runs.user_id")
  )
    return true;
  return value.cause !== undefined && value.cause !== error
    ? isActiveRunConflict(value.cause)
    : false;
}
