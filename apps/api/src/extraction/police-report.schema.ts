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

const text = field(z.string());
const flag = field(z.boolean());

const party = z.object({
  position: z.enum(['FIRST', 'SECOND', 'THIRD']),
  driverName: text,
  residentialAddress: text,
  contactNumber: text,
  vehicleMakeAndType: text,
  registrationNumber: text,
  insurer: text,
  policyNumber: text,
  registeredOwner: text,
  witness: text,
  injuries: text,
  passengerNames: text,
  vehicleDamage: text,
});

export const policeReportExtractionSchema = z.object({
  documentType: z.enum(['MOOVAH_POLICE_REPORT', 'OTHER_POLICE_REPORT', 'OTHER_DOCUMENT', 'UNREADABLE']),
  documentTypeReason: z.string(),
  readability: z.enum(['GOOD', 'PARTIAL', 'POOR']),

  tabNumber: text,
  place: text,
  dayOfWeek: text,
  accidentDate: text,
  accidentTime: text,
  placeOfOccurrence: text,

  parties: z.array(party),

  noCriminalActionContemplated: flag,
  forwardedToPublicProsecutor: flag,
  magistratesCourt: text,
  courtDate: text,
  convictedPerson: text,
  convictedOf: text,
  depositFineAmount: text,
  depositFinePaidBy: text,
  depositFineFor: text,
  responsiblePartyIfNoCharge: text,

  officerName: text,
  officerRank: text,
  officerContact: text,
  stationReported: text,
  reportDate: text,
  hasPoliceStamp: flag,
  hasOfficerSignature: flag,

  notes: z.array(z.string()),
});

export type PoliceReportExtraction = z.infer<typeof policeReportExtractionSchema>;
export type ExtractedParty = z.infer<typeof party>;
export type ExtractedField = z.infer<typeof text> | z.infer<typeof flag>;
