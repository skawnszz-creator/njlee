import type { ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import { requireSession } from "@/lib/auth/guards";
import { getDictionary } from "@/lib/i18n";

/**
 * 사내 구간. 여기 아래는 전부 세션이 있어야 볼 수 있다.
 * 세션 검증은 이 한 곳에서 하고, 각 화면에서 또 확인하지 않는다.
 * (데이터를 바꾸는 서버 액션은 별도로 다시 검증한다)
 */
export default async function InternalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireSession();
  const { lang, t } = await getDictionary();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader user={user} lang={lang} t={t} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
