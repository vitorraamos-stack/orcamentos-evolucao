/**
 * The Conta Azul sale number is the sole official OS identifier shown to users.
 * Internal or legacy os_number values must not be presented as official numbers.
 */
export function formatOfficialOsLabel(saleNumber: string | number | null | undefined): string {
  const value = String(saleNumber ?? "").trim();
  return value ? `OS #${value}` : "Número não informado";
}
