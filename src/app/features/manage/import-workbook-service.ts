import { Injectable } from '@angular/core';
import {
  createImportTemplate,
  ImportValidationContext,
  parseImportWorkbook,
} from './import-workbook';

@Injectable({ providedIn: 'root' })
export class ImportWorkbookService {
  createImportTemplate(event?: Record<string, unknown>) {
    return createImportTemplate(event);
  }

  parseImportWorkbook(buffer: ArrayBuffer, context?: ImportValidationContext) {
    return parseImportWorkbook(buffer, context);
  }
}
