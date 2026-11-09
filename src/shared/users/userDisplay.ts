type AuthUserWithName = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/** Auth metadata contains the names managed by the admin users API. */
export function getCurrentUserDisplayName(user: AuthUserWithName | null | undefined): string {
  const metadata = user?.user_metadata;
  for (const value of [metadata?.full_name, metadata?.name]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return user?.email?.trim() || "Usuário";
}
