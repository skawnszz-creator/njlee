import { setLanguageAction } from "@/app/actions/auth";
import { LANGUAGES, LANGUAGE_LABEL, type Lang } from "@/lib/i18n";

/**
 * 언어 전환. 쿠키에만 저장하고 URL 은 바꾸지 않는다.
 * 자바스크립트 없이도 동작하도록 form 으로 만든다.
 */
export function LanguageSwitch({ current }: { current: Lang }) {
  return (
    <form action={setLanguageAction} className="flex items-center gap-1">
      {LANGUAGES.map((lang) => {
        const active = lang === current;
        return (
          <button
            key={lang}
            name="lang"
            value={lang}
            type="submit"
            aria-pressed={active}
            className={
              active
                ? "rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
                : "rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }
          >
            {LANGUAGE_LABEL[lang]}
          </button>
        );
      })}
    </form>
  );
}
