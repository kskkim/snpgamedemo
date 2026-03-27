import Link from "next/link";

const rules = [
  "Make up to 10 trades during the challenge.",
  "Track your performance against the S&P 500.",
  "Win by finishing ahead of the index after your final trade.",
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16 sm:px-10 lg:px-12">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="max-w-3xl">
          <p className="inline-flex rounded-full border border-panel-border bg-white/70 px-4 py-2 text-sm font-medium tracking-[0.2em] text-muted uppercase shadow-sm backdrop-blur-sm">
            Milestone 1
          </p>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Beat the S&amp;P 500 in 10 Trades
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
            A focused stock-picking challenge with one simple goal: make up to
            10 decisions, measure every move, and find out whether you can beat
            the market benchmark.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href="/challenge"
              className="inline-flex items-center justify-center rounded-full bg-foreground px-7 py-4 text-base font-semibold text-background transition-transform duration-150 hover:-translate-y-0.5 hover:bg-[#20302b]"
            >
              Start Challenge
            </Link>
            <p className="text-sm text-muted">
              Clean setup, short rules, and a placeholder challenge flow for
              the next milestone.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-panel-border bg-panel p-8 shadow-[0_20px_70px_rgba(22,33,29,0.08)] backdrop-blur-sm">
          <p className="text-sm font-semibold tracking-[0.18em] text-muted uppercase">
            Rules Summary
          </p>
          <ul className="mt-6 space-y-4">
            {rules.map((rule, index) => (
              <li
                key={rule}
                className="flex gap-4 rounded-2xl border border-panel-border bg-white/80 p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                  {index + 1}
                </span>
                <p className="text-base leading-7 text-foreground">{rule}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-2xl bg-[#16211d] px-5 py-4 text-sm leading-6 text-[#dce8e3]">
            Keep it simple: fewer trades, clearer decisions, direct comparison
            against the index.
          </div>
        </div>
      </section>
    </main>
  );
}
