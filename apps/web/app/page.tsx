import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Car Buddy by Moovah: report a car accident on WhatsApp',
  description:
    'Start a Moovah motor claim on WhatsApp. Car Buddy reads your police report, asks for the rest one step at a time and keeps you updated.',
};

const POLICE_REPORT_FORM_URL =
  'https://moovah.co.zw/wp-content/uploads/2026/03/D1-117597-MOOVAH-MOTOR-ACCIDENT-POLICE-REPORT.pdf';

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '');
const whatsappLink = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=claim` : null;

type Line = { from: 'me' | 'bot'; body: ReactNode; time: string; buttons?: string[] };

const CONVERSATION: Line[] = [
  { from: 'me', body: 'claim', time: '17:52' },
  {
    from: 'bot',
    time: '17:52',
    body: (
      <>
        Sorry to hear about the accident, Tendai. I’ve opened claim <b className="whitespace-nowrap">CLM-4F0974</b> for <b className="whitespace-nowrap">AFM 2033</b>.
        <br />
        Please send a clear photo of the stamped police report.
      </>
    ),
  },
  { from: 'me', body: <ReportThumb />, time: '17:55' },
  {
    from: 'bot',
    time: '17:55',
    body: (
      <>
        <b>Here is what I read:</b>
        <br />
        TAB 45/11/26, Harare Central
        <br />
        21 Nov at 17:40, Samora Machel Ave &amp; 4th St
        <br />
        Is this correct?
      </>
    ),
    buttons: ['Yes, correct', 'Send again'],
  },
  { from: 'me', body: 'Yes, correct', time: '17:56' },
  {
    from: 'bot',
    time: '17:56',
    body: 'Thanks. A few more questions and photos to complete the claim. Who was driving?',
    buttons: ['It was me', 'Someone else'],
  },
];

function ReportThumb() {
  return (
    <span className="block w-40 rounded-sm bg-white p-2 shadow-sm" aria-label="Photo of a police report">
      <span className="block h-1.5 w-20 rounded-full bg-ink/70" />
      {[0, 1, 2, 3, 4].map((n) => (
        <span key={n} className="mt-1.5 block h-1 rounded-full bg-ink/15" style={{ width: `${90 - n * 9}%` }} />
      ))}
      <span className="mt-2 ml-auto block size-7 rounded-full border-2 border-signal/60" />
    </span>
  );
}

function Chat() {
  return (
    <ol className="flex flex-col gap-2.5" aria-label="Example claim conversation on WhatsApp">
      {CONVERSATION.map((line, n) => (
        <li
          key={n}
          className={`max-w-[85%] motion-safe:animate-[bubble-in_400ms_ease-out_both] ${line.from === 'me' ? 'self-end' : 'self-start'}`}
          style={{ animationDelay: `${300 + n * 650}ms` }}
        >
          <div
            className={`rounded-lg px-3 py-2 text-[15px] leading-snug text-ink shadow-[0_1px_0_rgba(11,37,89,0.12)] ${
              line.from === 'me' ? 'rounded-tr-none bg-chat-out' : 'rounded-tl-none bg-white'
            }`}
          >
            {line.body}
            <span className="mt-1 block text-right text-[11px] text-slate">{line.time}</span>
          </div>
          {line.buttons && (
            <div className="mt-1 grid grid-cols-2 gap-1">
              {line.buttons.map((b) => (
                <span key={b} className="rounded-lg bg-white px-2 py-1.5 text-center text-sm font-medium text-[#027eb5]">
                  {b}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function WhatsAppButton({ className = '' }: { className?: string }) {
  if (!whatsappLink) {
    return (
      <p className={`text-white/85 ${className}`}>
        Send <b className="text-white">claim</b> to Moovah Car Buddy on WhatsApp.
      </p>
    );
  }
  return (
    <a
      href={whatsappLink}
      className={`inline-flex items-center gap-2 rounded-full bg-signal px-6 py-3 font-semibold text-white hover:bg-[#b02a21] ${className}`}
    >
      <WhatsAppIcon />
      Start a claim on WhatsApp
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

const NEED: { title: string; body: ReactNode }[] = [
  {
    title: 'The police report, stamped',
    body: (
      <>
        On Moovah’s Motor Accident Police Report form, completed at the station where you reported the accident.{' '}
        <a href={POLICE_REPORT_FORM_URL} className="font-medium text-navy underline underline-offset-4">
          Download the form
        </a>
      </>
    ),
  },
  { title: 'The driver’s licence', body: 'A photo of the front and the back.' },
  { title: 'Your national ID', body: 'Or your passport.' },
  { title: 'Photos of the damage', body: 'One from each side of the vehicle, plus close-ups.' },
  { title: 'A sketch, if you can', body: 'Draw the road and the vehicles on paper and send a photo. You can skip it.' },
];

const AFTER = [
  { title: 'You confirm and submit', body: 'Car Buddy shows you everything before you send it, with a declaration to accept.' },
  { title: 'A processor reviews it', body: 'Moovah’s claims team checks the report and your photos, and may ask you for more on WhatsApp.' },
  { title: 'An assessor inspects', body: 'If needed, an assessor is assigned and looks at the damage.' },
  { title: 'You get the decision', body: 'Approved for repair at a named garage, a payout, or a reason if it isn’t approved.' },
];

export default function Home() {
  return (
    <div className="bg-white">
      <header className="mx-auto max-w-6xl px-5 py-4 sm:px-8">
        <p className="font-display text-lg font-bold text-navy">
          Car Buddy <span className="font-sans text-sm font-normal text-slate">by Moovah</span>
        </p>
      </header>

      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1fr_minmax(0,25rem)] md:py-20">
          <div className="max-w-xl">
            <h1 className="font-display text-[2.6rem] leading-[1.05] font-bold tracking-tight sm:text-6xl">
              Had an accident? Start your claim on WhatsApp.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-white/85">
              Car Buddy reads your police report, asks for the rest one step at a time, and sends it to Moovah’s claims
              team. Updates come back to the same chat.
            </p>
            <WhatsAppButton className="mt-8" />
            <p className="mt-6 text-sm text-white/70">
              If anyone is hurt, call 999 first, or 112 from an Econet line. Moovah is on 311.
            </p>
          </div>
          <div className="rounded-2xl bg-chat p-4 sm:p-5">
            <Chat />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-ink">What to have ready</h2>
        <p className="mt-3 max-w-xl text-slate">You can start without everything. Car Buddy saves your claim and picks up where you left off.</p>
        <ul className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {NEED.map((item) => (
            <li key={item.title} className="border-l-4 border-navy pl-4">
              <h3 className="font-semibold text-ink">{item.title}</h3>
              <p className="mt-1 text-slate">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-paper">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink">After you submit</h2>
            <ol className="mt-8 space-y-6">
              {AFTER.map((step, n) => (
                <li key={step.title} className="grid grid-cols-[2.25rem_1fr] gap-3">
                  <span className="font-display flex size-9 items-center justify-center rounded-full bg-navy font-semibold text-white">
                    {n + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 text-slate">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink">Also on Car Buddy</h2>
            <dl className="mt-8 space-y-6">
              <div>
                <dt className="font-semibold text-ink">Questions about your car</dt>
                <dd className="mt-1 text-slate">
                  Ask about warning lights, tyres or servicing, or send a photo. If something sounds unsafe, Car Buddy tells
                  you to stop driving.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">
                  Service reminders <span className="ml-1 rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-[#7a5a05]">Coming soon</span>
                </dt>
                <dd className="mt-1 text-slate">A nudge on WhatsApp when your tracker shows a service is due.</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-slate sm:px-8">
          <p>Car Buddy is a prototype for the Econet AI Hackathon. Test data only.</p>
          <p>
            Moovah: <a href="tel:311" className="font-medium text-ink underline-offset-4 hover:underline">311</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
