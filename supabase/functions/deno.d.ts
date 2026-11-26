// 型チェックと lint のための、使っている Deno の機能だけの宣言
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
