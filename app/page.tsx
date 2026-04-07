import Link from "next/link";

export default function Home() {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(18, 34, 40, 0.36), rgba(18, 34, 40, 0.36)), url('/treasures-home-bg.png')",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_45%),linear-gradient(to_top,rgba(224,148,71,0.24),transparent_28%)]" />

      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center text-center">
        <h1 className="max-w-5xl text-5xl font-semibold tracking-tight drop-shadow-[0_8px_24px_rgba(0,0,0,0.3)] sm:text-6xl lg:text-8xl">
          The Treasures Challenge
        </h1>
        <p className="mt-6 max-w-5xl text-2xl font-semibold leading-tight drop-shadow-[0_6px_18px_rgba(0,0,0,0.28)] sm:text-3xl lg:text-4xl">
          Beat the S&amp;P 500 over 24 hours to win a Pokemon Slab &amp; Treasures Points
        </p>

        <div className="mt-14 flex w-full max-w-[860px] flex-col items-center gap-7">
          <Link
            href="/v3"
            className="flex min-h-[132px] w-full items-center justify-center border-[3px] border-[#0d3550] bg-[#1f678d]/95 px-8 text-2xl font-medium text-white shadow-[0_14px_40px_rgba(0,0,0,0.28)] transition-transform hover:scale-[1.01]"
          >
            Start Challenge
          </Link>

          <div className="flex w-full max-w-[560px] flex-col gap-7 sm:flex-row sm:justify-center">
            <Link
              href="/v3"
              className="flex min-h-[158px] flex-1 items-center justify-center border-[3px] border-[#0d3550] bg-[#1f678d]/95 px-8 text-2xl font-medium text-white shadow-[0_14px_40px_rgba(0,0,0,0.28)] transition-transform hover:scale-[1.01]"
            >
              Rules
            </Link>
            <Link
              href="/v3/leaderboard"
              className="flex min-h-[158px] flex-1 items-center justify-center border-[3px] border-[#0d3550] bg-[#1f678d]/95 px-8 text-2xl font-medium text-white shadow-[0_14px_40px_rgba(0,0,0,0.28)] transition-transform hover:scale-[1.01]"
            >
              Leaderboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
