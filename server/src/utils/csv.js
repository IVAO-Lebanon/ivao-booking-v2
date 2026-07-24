import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

/** Parse a CSV buffer into an array of row objects keyed by header. */
export function parseCsv(buffer) {
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

/** Build a CSV string from an array of objects, given an ordered column list. */
export function toCsv(columns, rows) {
  return stringify(rows, { header: true, columns });
}
