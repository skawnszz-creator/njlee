"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { PhotoKind } from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n";

/**
 * 계측기 사진 올리기.
 *
 * 성적서 올리기와 같은 방식이다 — 파일을 요청 본문에 그대로 실어 보낸다(PUT).
 * 본체 사진과 부속품 사진 칸이 따로라서 kind 를 함께 보낸다.
 */
export function PhotoUpload({
  meterId,
  kind,
  t,
}: {
  meterId: string;
  kind: PhotoKind;
  t: Dictionary;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const inputId = `photo-upload-${meterId}-${kind}`;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      let done = 0;
      for (const file of Array.from(files)) {
        setProgress(`${done + 1} / ${files.length}`);

        const response = await fetch(
          `/api/meters/${meterId}/photos?kind=${kind}&name=${encodeURIComponent(file.name)}`,
          { method: "PUT", body: file },
        );

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(body?.message ?? t.detail.photoFailed);
        }
        done += 1;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.detail.photoFailed);
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png"
        disabled={busy}
        onChange={(event) => upload(event.target.files)}
        className="hidden"
        id={inputId}
      />
      <label
        htmlFor={inputId}
        title={t.detail.photoHint}
        className={`cursor-pointer rounded-md px-2 py-1 text-xs font-medium ${
          busy
            ? "bg-slate-300 text-slate-500"
            : "bg-slate-900 text-white hover:bg-slate-700"
        }`}
      >
        {busy ? `${t.detail.photoUploading} ${progress}` : `+ ${t.detail.photoAdd}`}
      </label>

      {error && (
        <span className="w-full rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </span>
      )}
    </>
  );
}
