import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import type { WebUser } from "@/lib/db/schema";
import type { Dictionary, Lang } from "@/lib/i18n";
import { LanguageSwitch } from "./LanguageSwitch";

export function AppHeader({
  user,
  lang,
  t,
}: {
  user: WebUser;
  lang: Lang;
  t: Dictionary;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            {t.app.title}
          </span>
          <span className="text-xs font-medium text-slate-400">
            {t.app.company}
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <LanguageSwitch current={lang} />

          <span className="hidden items-center gap-1.5 text-sm text-slate-600 sm:flex">
            {user.displayName}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              {user.role === "ADMIN" ? t.nav.admin : t.nav.viewer}
            </span>
          </span>

          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {t.nav.logout}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
