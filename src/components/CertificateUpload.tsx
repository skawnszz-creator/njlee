"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Dictionary } from "@/lib/i18n";

/**
 * 성적서 올리기.
 *
 * 파일을 요청 본문에 그대로 실어 보낸다(PUT). FormData 로 감싸지 않으므로
 * 서버가 메모리에 통째로 올리지 않고 스트림으로 디스크에 쓸 수 있다.
 */
export function CertificateUpload({
  meterId,
  t,
}: {
  meterId: string;
  t: Dictionary;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      let done = 0;
      for (const file of Array.from(files)) {
        setProgress(`${done + 1} / ${files.length}`);

        const response = await fetch(
          `/api/meters/${meterId}/certificates?name=${encodeURIComponent(file.name)}`,
          { method: "PUT", body: file },
        );

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(body?.message ?? t.cert.failed);
        }
        done += 1;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.cert.failed);
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        disabled={busy}
        onChange={(event) => upload(event.target.files)}
        className="hidden"
        id={`cert-upload-${meterId}`}
      />
      <label
        htmlFor={`cert-upload-${meterId}`}
        className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium ${
          busy
            ? "bg-slate-300 text-slate-500"
            : "bg-slate-900 text-white hover:bg-slate-700"
        }`}
      >
        {busy ? `${t.cert.uploading} ${progress}` : `+ ${t.cert.upload}`}
      </label>
      <span className="text-xs text-slate-400">{t.cert.uploadHint}</span>

      {error && (
        <span className="w-full rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
