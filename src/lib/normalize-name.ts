export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, "") // remove special characters but keep whitespace
    .replace(/\s+/g, " ") // collapse internal whitespace runs
    .trim();
}

