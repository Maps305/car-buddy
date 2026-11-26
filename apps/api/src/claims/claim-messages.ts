export interface ClaimMessageContext {
  reference: string;
  registration: string;
  firstName: string;
}

const MOOVAH_LINE = 'If you have questions, call Moovah on 311.';

export const claimMessages = {
  reviewStarted: (c: ClaimMessageContext) =>
    `Hi ${c.firstName}, Moovah has started reviewing claim *${c.reference}* for *${c.registration}*. I'll message you here when there's an update.`,

  assessorAssigned: (c: ClaimMessageContext) =>
    `An assessor has been assigned to claim *${c.reference}*. Moovah will contact you to arrange an inspection of *${c.registration}*.`,

  infoRequired: (c: ClaimMessageContext, note: string) =>
    [
      `Moovah needs more information for claim *${c.reference}* (${c.registration}):`,
      '',
      note,
      '',
      'Reply here with the details, photos or PDFs. When you have sent everything, reply *done*.',
    ].join('\n'),

  approved: (c: ClaimMessageContext, d: { settlement: 'REPAIR' | 'CASH'; garage?: string; note?: string }) =>
    [
      d.settlement === 'REPAIR'
        ? `Good news: claim *${c.reference}* is approved. *${c.registration}* will be repaired at *${d.garage}*. Moovah will confirm the next steps with you.`
        : `Good news: claim *${c.reference}* is approved for a cash settlement. Moovah will contact you about payment.`,
      ...(d.note ? ['', d.note] : []),
    ].join('\n'),

  rejected: (c: ClaimMessageContext, reason: string) =>
    [`Claim *${c.reference}* for *${c.registration}* has not been approved.`, '', `Reason: ${reason}`, '', MOOVAH_LINE].join('\n'),
};
