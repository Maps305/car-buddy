import { Injectable } from '@nestjs/common';
import { CaimexService, type MediaInput } from '../caimex/caimex.service';
import { POLICE_REPORT_INSTRUCTION, POLICE_REPORT_SYSTEM_PROMPT } from './police-report.prompt';
import { reviewPoliceReport, type ClaimContext, type PoliceReportReview } from './police-report.review';
import { policeReportExtractionSchema, type PoliceReportExtraction } from './police-report.schema';
import { QUOTATION_INSTRUCTION, QUOTATION_SYSTEM_PROMPT } from './quotation.prompt';
import { quotationExtractionSchema, type QuotationExtraction } from './quotation.schema';

export interface PoliceReportResult {
  extraction: PoliceReportExtraction;
  review: PoliceReportReview;
  model: string;
  extractedAt: string;
}

@Injectable()
export class ExtractionService {
  constructor(private readonly caimex: CaimexService) {}

  async extractPoliceReport(pages: MediaInput[], context: ClaimContext): Promise<PoliceReportResult> {
    if (pages.length === 0) throw new Error('No pages supplied');
    const { data, model } = await this.caimex.extractStructured({
      schema: policeReportExtractionSchema,
      schemaName: 'police_report_extraction',
      system: POLICE_REPORT_SYSTEM_PROMPT,
      instruction: POLICE_REPORT_INSTRUCTION,
      media: pages,
    });
    return {
      extraction: data,
      review: reviewPoliceReport(data, context),
      model,
      extractedAt: new Date().toISOString(),
    };
  }

  async extractQuotation(file: MediaInput): Promise<{ extraction: QuotationExtraction; model: string }> {
    const { data, model } = await this.caimex.extractStructured({
      schema: quotationExtractionSchema,
      schemaName: 'quotation_extraction',
      system: QUOTATION_SYSTEM_PROMPT,
      instruction: QUOTATION_INSTRUCTION,
      media: [file],
    });
    return { extraction: data, model };
  }
}
