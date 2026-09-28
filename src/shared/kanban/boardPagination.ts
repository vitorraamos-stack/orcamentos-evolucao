export const BOARD_PAGE_SIZE = 500;
export const BOARD_ACTIVE_LIMIT = 10_000;

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = BOARD_PAGE_SIZE,
  safetyLimit = BOARD_ACTIVE_LIMIT
): Promise<T[]> {
  const all: T[] = [];
  while (true) {
    const page = await fetchPage(all.length, all.length + pageSize - 1);
    if (all.length + page.length > safetyLimit)
      throw new Error(
        `O quadro excedeu o limite técnico explícito de ${safetyLimit} OS ativas.`
      );
    all.push(...page);
    if (page.length < pageSize) return all;
    if (all.length === safetyLimit)
      throw new Error(
        `O quadro atingiu o limite técnico explícito de ${safetyLimit} OS ativas.`
      );
  }
}
