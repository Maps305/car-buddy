import { redirect } from 'next/navigation';
import { getUser } from '@/lib/session';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await getUser()) redirect('/claims');
  const { expired } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <p className="text-lg font-semibold">Car Buddy claims desk</p>
        <div className="max-w-md">
          <p className="text-4xl leading-tight font-semibold tracking-tight">
            Claims arrive from WhatsApp with the police report already read.
          </p>
          <p className="mt-5 text-lg leading-relaxed text-white/75">
            Check what the AI extracted against the document, assign an assessor, and record the decision. Every
            step is logged.
          </p>
        </div>
        <p className="text-sm text-white/60">Prototype for the Econet AI Hackathon. Test data only.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
          <p className="mt-2 mb-8 text-slate">Use your claims processor or assessor account.</p>
          <LoginForm expired={expired === '1'} />
        </div>
      </section>
    </main>
  );
}
