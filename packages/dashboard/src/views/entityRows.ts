import { shortId } from "../ui";
import type { ViewRow } from "@metacrdt/views-react";

export interface RawEntityRow {
  readonly id: string;
  readonly attributes: Record<string, readonly unknown[]>;
  readonly denied?: readonly { readonly a: string }[];
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function flattenEntityRows(
  rows: readonly RawEntityRow[],
  columnNames?: readonly string[],
): ViewRow[] {
  const cols = (
    columnNames !== undefined
      ? columnNames.filter((name) => name !== "name").slice(0, 5)
      : [
          ...new Set(
            rows.flatMap((row) =>
              Object.keys(row.attributes).filter(
                (name) => name !== "name" && name !== "type",
              ),
            ),
          ),
        ].sort()
  );

  return rows.map((row) => {
    const deniedKeys = new Set((row.denied ?? []).map((d) => d.a));
    const out: ViewRow = {
      id: row.id,
      name: valueText(row.attributes["name"]?.[0] ?? shortId(row.id)),
    };
    for (const name of cols) {
      out[name] = deniedKeys.has(name)
        ? "Denied"
        : (row.attributes[name] ?? []).map(valueText).join(", ");
    }
    return out;
  });
}
