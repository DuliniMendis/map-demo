/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Language codes from an AUSTLANG CSV (column named like "language_code"). */
export function csvLanguageCodes(text: string): string[] {
  const [header = [], ...rows] = parseCsv(text);
  const col = header.findIndex((h) => /language[_ ]?code/i.test(h.trim()));
  if (col === -1) return [];
  return rows.map((r) => (r[col] ?? '').trim()).filter(Boolean);
}
