import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import type { StandingsExport } from '../../core/standings/standings-types';
import { createStandingsWorkbook, standingsFilename, type ExportText } from './export-workbook';

export interface PreparedStandingsFile {
  blob: Blob;
  filename: string;
}

@Injectable({ providedIn: 'root' })
export class ExportWorkbookService {
  private readonly document = inject(DOCUMENT);
  async prepare(
    snapshot: StandingsExport,
    language: string,
    text: ExportText,
  ): Promise<PreparedStandingsFile> {
    const workbook = await createStandingsWorkbook(snapshot, language, text);
    const data = await workbook.xlsx.writeBuffer();
    return {
      blob: new Blob([new Uint8Array(data)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      filename: standingsFilename(snapshot.event.code, snapshot.generated_at),
    };
  }
  download(file: PreparedStandingsFile) {
    const url = URL.createObjectURL(file.blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = file.filename;
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
