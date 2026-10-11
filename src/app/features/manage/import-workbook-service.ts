import { Injectable } from '@angular/core';
import {
  createImportTemplate,
  ImportValidationContext,
  parseImportWorkbook,
} from './import-workbook';

@Injectable({ providedIn: 'root' })
export class ImportWorkbookService {
  createImportTemplate(setup?: ImportValidationContext) {
    return createImportTemplate(setup);
  }

  parseImportWorkbook(buffer: ArrayBuffer, context?: ImportValidationContext) {
    return parseImportWorkbook(buffer, context);
  }
}
