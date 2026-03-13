import { Sparkles } from "lucide-react";

export function HeroSection() {
  return (
    <div className="overflow-hidden rounded-[36px] bg-gradient-to-r from-violet-700 via-fuchsia-600 to-sky-500 px-5 py-6 text-white shadow-xl shadow-violet-200/60 sm:px-6 sm:py-7">
      <div className="flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 text-sm font-medium backdrop-blur">
          <Sparkles className="h-4 w-4" />
          Disneyland Magic Key live tracker
        </div>
        <h1 className="mt-4 text-[2rem] font-bold leading-tight sm:text-[2.35rem]">
          Disneyland Magic Key Wishboard
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm text-white/90 sm:text-[15px]">
          Track the dates you care about, sync Disney availability live, and keep your Magic Key watchlist clean and easy to read.
        </p>
      </div>
    </div>
  );
}
