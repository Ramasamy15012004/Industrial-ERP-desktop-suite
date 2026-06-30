import * as XLSX from "xlsx";
import { isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function downloadWorkbookXlsx(workbook, filename) {
  const workbookBytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  if (isTauri()) {
    const filePath = await save({
      defaultPath: filename,
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });

    if (!filePath) return false;

    await writeFile(filePath, new Uint8Array(workbookBytes));
    return true;
  }

  // Browser fallback
  const blob = new Blob([workbookBytes], { type: XLSX_MIME_TYPE });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => window.URL.revokeObjectURL(url), 60000);

  return true;
}
