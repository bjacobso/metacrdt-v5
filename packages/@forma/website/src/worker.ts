import { getPipeline } from "./pipelines";

interface Env {
  readonly ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

interface RouteMeta {
  readonly title: string;
  readonly description: string;
  readonly path: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return env.ASSETS.fetch(request);
    }

    const url = new URL(request.url);
    const meta = metaForPath(url.pathname);
    if (!meta) {
      return env.ASSETS.fetch(request);
    }

    const indexUrl = new URL("/index.html", url);
    const response = await env.ASSETS.fetch(new Request(indexUrl, request));
    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.set("content-type", "text/html; charset=utf-8");

    return new Response(injectMeta(html, meta, url.origin), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

function metaForPath(pathname: string): RouteMeta | null {
  if (pathname === "/") {
    return {
      title: "Forma",
      description:
        "Forma is a small typed language that compiles into the systems you already use. Watch every compiler pass happen.",
      path: "/",
    };
  }

  if (pathname === "/about") {
    return {
      title: "About Forma",
      description:
        "Forma is a Lisp-shaped authoring surface for typed ontology, runtime, and deployment artifacts.",
      path: "/about",
    };
  }

  if (pathname === "/demo") {
    return {
      title: "Forma Pipeline Gallery",
      description: "Choose a Forma compiler pipeline and inspect each pass from source to output.",
      path: "/demo",
    };
  }

  const pipelineId = pathname.match(/^\/demo\/([^/]+)$/)?.[1];
  if (pipelineId) {
    const pipeline = getPipeline(pipelineId);
    return {
      title: `${pipeline.title} - Forma`,
      description: pipeline.tagline,
      path: `/demo/${pipeline.id}`,
    };
  }

  return null;
}

function injectMeta(html: string, meta: RouteMeta, origin: string): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const url = escapeHtml(new URL(meta.path, origin).toString());
  const image = escapeHtml(new URL("/og-image.svg", origin).toString());

  return html
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${description}" />`,
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:title" content="${title}" />`,
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:description" content="${description}" />`,
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:image" content="${image}" />\n    <meta property="og:url" content="${url}" />`,
    );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
