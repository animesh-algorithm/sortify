export function spotifySetupError(): string | null {
  if (
    !process.env.SPOTIFY_CLIENT_ID ||
    !process.env.SPOTIFY_CLIENT_SECRET ||
    !process.env.SPOTIFY_REDIRECT_URI
  )
    return "setup";
  try {
    const database = new URL(process.env.TURSO_DATABASE_URL ?? "");
    if (
      !["libsql:", "https:", "file:"].includes(database.protocol) ||
      (database.protocol !== "file:" && !process.env.TURSO_AUTH_TOKEN) ||
      (process.env.NODE_ENV === "production" && database.protocol === "file:")
    )
      return "database_setup";
  } catch {
    return "database_setup";
  }
  if (
    Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64").length !== 32
  )
    return "encryption_setup";
  return null;
}
