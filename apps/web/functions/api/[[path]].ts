const API_ORIGIN = "https://capex-lens.yp-798.workers.dev";
const READ_METHODS = new Set(["GET", "HEAD"]);

function jsonError(status: number, error: string, message: string): Response {
  return Response.json(
    { error, message },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export const onRequest: PagesFunction = async ({ request }) => {
  if (!READ_METHODS.has(request.method)) {
    return jsonError(405, "method_not_allowed", "The public Capex Lens API is read-only.");
  }

  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, API_ORIGIN);
  const headers = new Headers();
  headers.set("accept", request.headers.get("accept") ?? "application/json");

  for (const name of ["if-match", "if-modified-since", "if-none-match", "if-unmodified-since"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      redirect: "manual",
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("x-capex-api-proxy", "cloudflare-pages");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return jsonError(502, "upstream_unavailable", "The Capex Lens API is temporarily unavailable.");
  }
};
