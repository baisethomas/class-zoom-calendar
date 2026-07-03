/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      index += 1;
      continue;
    }
    if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (field !== "" || row.length > 0) pushRow();
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export const CSV_HEADERS = [
  "title",
  "teacher",
  "date",
  "start_time",
  "end_time",
  "zoom_url",
  "description",
] as const;

export type CsvClassRow = {
  rowNumber: number;
  title: string;
  teacherName: string;
  date: string;
  startTime: string;
  endTime: string;
  zoomUrl: string;
  description: string;
};

export type CsvParseResult =
  | { ok: true; rows: CsvClassRow[] }
  | { ok: false; error: string };

export function parseClassCsv(text: string, maxRows = 500): CsvParseResult {
  const table = parseCsv(text);
  if (table.length === 0) return { ok: false, error: "The CSV is empty." };

  const header = table[0]!.map((cell) => cell.trim().toLowerCase());
  const required = CSV_HEADERS.slice(0, 6);
  for (const column of required) {
    if (!header.includes(column)) {
      return {
        ok: false,
        error: `Missing required column "${column}". Expected columns: ${CSV_HEADERS.join(", ")} (description is optional).`,
      };
    }
  }

  const dataRows = table.slice(1);
  if (dataRows.length === 0) return { ok: false, error: "The CSV has a header but no rows." };
  if (dataRows.length > maxRows) {
    return { ok: false, error: `The CSV has too many rows (limit ${maxRows}).` };
  }

  const columnIndex = (name: string) => header.indexOf(name);
  const cell = (cells: string[], name: string) => {
    const position = columnIndex(name);
    return position === -1 ? "" : (cells[position] ?? "").trim();
  };

  const rows = dataRows.map((cells, index) => ({
    rowNumber: index + 2,
    title: cell(cells, "title"),
    teacherName: cell(cells, "teacher"),
    date: cell(cells, "date"),
    startTime: cell(cells, "start_time"),
    endTime: cell(cells, "end_time"),
    zoomUrl: cell(cells, "zoom_url"),
    description: cell(cells, "description"),
  }));

  return { ok: true, rows };
}
