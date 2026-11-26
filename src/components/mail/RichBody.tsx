import { useEffect, useMemo, useRef, useState } from "react";
import { mailDocument, sanitizeMailHtml } from "../../lib/mail/html";
import { openUrl } from "../../lib/platform";

/**
 * An HTML email in a sandboxed frame: no scripts can run (sandbox + policy), links open in your browser,
 * and remote pictures load only when `allowImages` is true. Sizes itself to the message.
 */
export function RichBody({
  html,
  allowImages,
  onShowImages,
  onTrustSender,
  sender,
}: {
  html: string;
  allowImages: boolean;
  onShowImages: () => void;
  onTrustSender: () => void;
  sender: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const clean = useMemo(() => sanitizeMailHtml(html, allowImages), [html, allowImages]);
  const doc = useMemo(() => mailDocument(clean.html, allowImages), [clean.html, allowImages]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | undefined;
    let raf = 0;
    const onLoad = () => {
      const d = frame.contentDocument;
      if (!d) return;
      // measure the content itself (not the frame's own height) and apply it on the next frame, so resizing
      // the frame can never feed back into the observer that triggered it
      const fit = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const h = Math.min(30000, Math.max(120, Math.ceil(d.body.getBoundingClientRect().height))); // capped: a message can never grow the frame without end
          setHeight((prev) => (Math.abs(prev - h) < 2 ? prev : h));
        });
      };
      fit();
      ro?.disconnect();
      ro = new ResizeObserver(fit);
      ro.observe(d.body);
      // links: only web, mail and phone links; they open outside the app
      d.addEventListener("click", (e) => {
        const a = (e.target as Element | null)?.closest?.("a[href]");
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute("href") ?? "";
        if (/^(https?:|mailto:|tel:)/i.test(href)) void openUrl(href);
      });
    };
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [doc]);

  return (
    <div className="stack" style={{ gap: 8 }}>
      {!allowImages && clean.blockedImages > 0 && (
        <div className="img-bar" role="status">
          <span>
            <b>Pictures are blocked</b> so the sender can't tell you opened this.
          </span>
          <button className="card-link" onClick={onShowImages}>
            Show pictures
          </button>
          <button className="card-link" onClick={onTrustSender}>
            Always show for {sender}
          </button>
        </div>
      )}
      <iframe
        ref={ref}
        className="mail-frame"
        title="Message"
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        srcDoc={doc}
        style={{ height }}
      />
    </div>
  );
}
