"use client";

export const TELEGRAM_URL = "https://t.me/battleshipNfactorial";
export const TELEGRAM_BLUE = "#2AABEE";

export function TelegramLink({
  variant = "button",
  className = "",
  children,
}: {
  variant?: "button" | "inline";
  className?: string;
  children?: React.ReactNode;
}) {
  if (variant === "inline") {
    return (
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline-offset-2 hover:underline font-bold ${className}`}
        style={{ color: TELEGRAM_BLUE, textShadow: `0 0 8px ${TELEGRAM_BLUE}` }}
      >
        {children ?? "@battleshipNfactorial"}
      </a>
    );
  }
  return (
    <a
      href={TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 ${className}`}
      style={{
        color: TELEGRAM_BLUE,
        border: `1px solid ${TELEGRAM_BLUE}80`,
        background: `${TELEGRAM_BLUE}1A`,
        boxShadow: `0 0 18px ${TELEGRAM_BLUE}55`,
      }}
    >
      {children ?? "💬 Join Telegram"}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 pb-10 pt-2 grid gap-3">
      <div
        className="rounded-2xl px-4 py-3 grid sm:flex sm:items-center sm:justify-between gap-3 text-center sm:text-left"
        style={{
          color: TELEGRAM_BLUE,
          border: `1px solid ${TELEGRAM_BLUE}66`,
          background: `${TELEGRAM_BLUE}10`,
          boxShadow: `0 0 16px ${TELEGRAM_BLUE}40`,
        }}
      >
        <div className="text-sm">
          <strong>💬 Join the Battleship.Neon community</strong>
          <span className="text-fg-dim ml-2">
            Bug reports, feature ideas, balance feedback — bring it all.
          </span>
        </div>
        <TelegramLink>💬 Open Telegram</TelegramLink>
      </div>
      <div className="text-[11px] text-fg-dim text-center leading-relaxed">
        Built with Next.js · Tailwind · Framer Motion · Supabase.
      </div>
    </footer>
  );
}
