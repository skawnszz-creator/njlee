import { devLoginAsAction, devLoginNewAction } from "@/app/actions/auth";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { safeReturnTo } from "@/lib/auth/guards";
import { devLoginEnabled, listDevUsers } from "@/lib/auth/dev-login";
import { getSessionUser } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { lang, t } = await getDictionary();

  // 이미 로그인되어 있으면 목록으로 보낸다.
  if (await getSessionUser()) redirect("/");

  const returnTo = safeReturnTo(
    typeof sp.returnTo === "string" ? sp.returnTo : undefined,
  );
  const failed = sp.error === "1";
  const enabled = devLoginEnabled();
  const users = enabled ? await listDevUsers() : [];

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">
            {t.login.title}
          </h1>
          <LanguageSwitch current={lang} />
        </div>

        {failed && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {t.login.failed}
          </p>
        )}

        {!enabled ? (
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-6">
            <p className="text-sm text-slate-600">{t.login.portalPending}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* dss-auth OIDC 연결 시 폐기 대상 */}
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t.login.tempNotice}
            </p>

            <div className="rounded-lg border border-slate-200 bg-white">
              <p className="border-b border-slate-200 px-5 py-2.5 text-xs font-semibold text-slate-500">
                {t.login.pickUser}
              </p>
              <ul className="divide-y divide-slate-100">
                {users.map((user) => (
                  <li key={user.id}>
                    <form action={devLoginAsAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">
                          {user.displayName}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                          {user.role === "ADMIN" ? t.nav.admin : t.nav.viewer}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
                {users.length === 0 && (
                  <li className="px-5 py-4 text-sm text-slate-400">-</li>
                )}
              </ul>
            </div>

            <form
              action={devLoginNewAction}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <p className="mb-2 text-xs font-semibold text-slate-500">
                {t.login.newViewer}
              </p>
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="flex gap-2">
                <input
                  name="name"
                  required
                  maxLength={40}
                  placeholder={t.login.namePlaceholder}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                >
                  {t.login.submit}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
