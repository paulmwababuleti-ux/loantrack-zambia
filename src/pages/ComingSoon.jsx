import { Hammer } from 'lucide-react';

export default function ComingSoon({ title, phase, children }) {
  return (
    <div className="card mt-6 px-6 py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Hammer size={26} /></div>
      <h2 className="mt-4 text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-base text-stone-600">{children}</p>
      <p className="mt-4 inline-block rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-600">Built in Phase {phase}</p>
    </div>
  );
}
