import DOMPurify from "dompurify";

/**
 * Sanitize an HTML string before injecting it via dangerouslySetInnerHTML.
 * Strips <script>, event handlers, javascript: URLs, and other XSS vectors.
 *
 * Use everywhere we render HTML that originated from:
 *  - AI-generated content (blog/articles/geo content)
 *  - External email bodies / webhooks
 *  - Any user/third-party-controlled string
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  if (typeof window === "undefined") {
    // SSR safety: skip sanitization on the server, the client will re-render.
    // (We never trust server-rendered raw HTML either — but DOMPurify needs window.)
    return "";
  }
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover"],
  });
}
