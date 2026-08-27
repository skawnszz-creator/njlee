/**
 * 저장된 파일을 HTTP 로 내려주는 공통 처리.
 *
 * 왜 직접 만들었나
 *   createReadStream + Readable.toWeb 을 쓰면, 브라우저가 연결을 중간에 끊었을 때
 *   (PDF 뷰어는 이걸 자주 한다) 파일 핸들이 닫히지 않고 남는다. 성적서를 여러 번
 *   열다 보면 핸들이 쌓여 개발 서버 워커가 죽었다.
 *
 *   여기서는 웹 표준 ReadableStream 을 직접 만들고, 끝났을 때든 취소됐을 때든
 *   반드시 파일을 닫는다.
 *
 * Range 요청도 받는다
 *   브라우저 PDF 뷰어는 파일 전체가 아니라 필요한 부분만 요청하는 일이 많다.
 *   이걸 무시하면 뷰어가 연결을 끊었다 다시 여는 일이 반복된다.
 */
import { open } from "node:fs/promises";
import { stat } from "node:fs/promises";

const CHUNK_SIZE = 64 * 1024;

/** start~end(둘 다 포함)를 64KB 씩 읽어 흘려보낸다. 다 읽거나 취소되면 파일을 닫는다. */
async function createFileStream(
  absolutePath: string,
  start: number,
  end: number,
): Promise<ReadableStream<Uint8Array>> {
  const handle = await open(absolutePath, "r");
  let position = start;
  let closed = false;

  async function closeOnce() {
    if (closed) return;
    closed = true;
    await handle.close().catch(() => {});
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const remaining = end - position + 1;
        if (remaining <= 0) {
          await closeOnce();
          controller.close();
          return;
        }

        const size = Math.min(CHUNK_SIZE, remaining);
        const buffer = Buffer.allocUnsafe(size);
        const { bytesRead } = await handle.read(buffer, 0, size, position);

        if (bytesRead === 0) {
          await closeOnce();
          controller.close();
          return;
        }

        position += bytesRead;
        controller.enqueue(buffer.subarray(0, bytesRead));
      } catch (error) {
        await closeOnce();
        controller.error(error);
      }
    },
    async cancel() {
      // 브라우저가 중간에 끊었을 때 여기로 온다. 반드시 닫는다.
      await closeOnce();
    },
  });
}

/** "bytes=0-1023" 같은 값을 해석한다. 여러 구간 요청은 받지 않는다. */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;

  if (rawStart === "" && rawEnd === "") return null;

  // "bytes=-500" : 마지막 500 바이트
  if (rawStart === "") {
    const length = Number(rawEnd);
    if (!Number.isFinite(length) || length <= 0) return null;
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Number(rawEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= size || end < start) return null;

  return { start, end: Math.min(end, size - 1) };
}

export type ServeFileOptions = {
  request: Request;
  absolutePath: string;
  mimeType: string;
  /** 원본 파일명. 한글이어도 된다. */
  fileName: string;
  /** true 면 저장 대화상자, false 면 브라우저에서 바로 열기 */
  download?: boolean;
};

export async function serveFile(options: ServeFileOptions): Promise<Response> {
  const { request, absolutePath, mimeType, fileName, download } = options;

  const info = await stat(absolutePath);
  const size = info.size;

  const headers: Record<string, string> = {
    "Content-Type": mimeType,
    // 브라우저가 내용을 보고 타입을 바꿔 해석하지 못하게 한다.
    "X-Content-Type-Options": "nosniff",
    // 한글 파일명을 위해 filename* 형식을 쓴다.
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(
      fileName,
    )}`,
    "Cache-Control": "private, max-age=600",
    "Accept-Ranges": "bytes",
  };

  const rangeHeader = request.headers.get("range");
  const range = parseRange(rangeHeader, size);

  // 해석은 됐지만 범위가 파일 밖이면 규격대로 416 을 돌려준다.
  if (rangeHeader && !range && /^bytes=/.test(rangeHeader.trim())) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const length = end - start + 1;

  // HEAD 요청에는 본문 없이 헤더만 돌려준다.
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  const stream = await createFileStream(absolutePath, start, end);

  return new Response(stream, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "Content-Length": String(length),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
