import { z } from 'zod';

const UNREAD = { value: null, confidence: 0, sourceText: null };

const field = <T extends z.ZodType>(value: T) =>
  z
    .object({
      value: value.nullable(),
      confidence: z.number().min(0).max(1),
      sourceText: z.string().nullable(),
    })
    .catch(UNREAD);

export const quotationExtractionSchema = z.object({
  isQuotation: z.boolean(),
  reason: z.string(),
  supplier: field(z.string()),
  quoteDate: field(z.string()),
  currency: field(z.string()),
  total: field(z.number()),
  vehicleRegistration: field(z.string()),
  lineItems: z
    .array(z.object({ description: z.string(), amount: z.number().nullable() }))
    .max(40)
    .catch([]),
});

export type QuotationExtraction = z.infer<typeof quotationExtractionSchema>;
