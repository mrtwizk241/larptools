// Spreadsheet files for the staff upload.
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** True for a spreadsheet file, by name or type. */
export function isSpreadsheet(file: File): boolean {
  return file.name.toLowerCase().endsWith('.xlsx') || file.type === XLSX_MIME;
}
