import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import type { UiAttachment } from '../../../shared/api.js';

/**
 * One attachment, as a chip.
 *
 * **An image is drawn in colour**, in the composer and in the transcript alike. That is the one
 * place DESIGN.md's governing rule yields, and it yields on a narrow reading: saturation is
 * blobot's to spend and it spends it on blobatars, but a file the *user* attached is their own
 * content quoted back to them, not a signal blobot is emitting. The reason to scroll back to a
 * message from last week is to find which screenshot you sent, and a grey rectangle answers that
 * badly. It licenses nothing else — no coloured chrome, no coloured icons, and a vendor's logo
 * is still greyed.
 *
 * A text file has no picture, so it is a mono glyph, its name and its size, which is everything
 * there is to say about it.
 *
 * The picture is fetched here rather than carried in the snapshot: a transcript of two hundred
 * messages must not be two hundred images on every re-render.
 */
export function Attached({
  attachment,
  onRemove,
}: {
  attachment: UiAttachment;
  /** Present only in the composer. A sent message is a record and cannot be edited. */
  onRemove?: () => void;
}): React.JSX.Element {
  const url = useAttachmentUrl(attachment);
  return (
    <div className={`chip${attachment.kind === 'image' ? ' pic' : ''}`}>
      {attachment.kind === 'image' ? (
        url === undefined ? (
          // Not a spinner: the picture arrives in a frame or two and a spinner at this size is
          // more motion than the thing it stands for.
          <span className="shim" aria-hidden />
        ) : (
          <img src={url} alt={attachment.name ?? 'attached image'} />
        )
      ) : (
        <FileText size={14} aria-hidden />
      )}
      <span className="cname">{attachment.name ?? 'pasted image'}</span>
      <span className="csize">{sizeOf(attachment.bytes)}</span>
      {onRemove !== undefined && (
        <button className="cx" onClick={onRemove} aria-label={`Remove ${attachment.name ?? 'the pasted image'}`}>
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** The picture for one chip, once. Text attachments never ask. */
function useAttachmentUrl(attachment: UiAttachment): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (attachment.kind !== 'image') return;
    let live = true;
    void window.blobot.attachmentUrl(attachment.id).then((found) => {
      if (live) setUrl(found);
    });
    return () => {
      live = false;
    };
  }, [attachment.id, attachment.kind]);
  return url;
}

/**
 * A size as a person says it.
 *
 * The renderer's own copy of core's `formatSize`, because a size on screen is product copy and
 * the renderer decides how a thing is spoken. They agree on purpose: the number in a refusal
 * and the number on the chip are the same fact.
 */
export function sizeOf(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
