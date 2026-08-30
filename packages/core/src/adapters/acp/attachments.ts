import type { AttachmentSupport, PromptAttachment } from '../../runtime.js';
import type { AgentCapabilities } from './wire.js';

/**
 * What an ACP agent said it takes, in blobot's own words.
 *
 * Shared because it is the protocol's shape rather than a provider's: both runtimes answer this
 * question in the same field, and a third that speaks ACP will too. Absent means **no** — the
 * spec says everything past text and `resource_link` is opt-in, and a composer that offers a
 * paperclip against a silent runtime is offering a refusal.
 */
export function acceptsOf(capabilities: AgentCapabilities | undefined): AttachmentSupport {
  return {
    images: capabilities?.promptCapabilities?.image === true,
    textFiles: capabilities?.promptCapabilities?.embeddedContext === true,
  };
}

/** Nothing, which is what a runtime that has not started yet has said. */
export const ACCEPTS_NOTHING: AttachmentSupport = { images: false, textFiles: false };

/**
 * One attachment as a prompt content block.
 *
 * An image is `image`, a text file is an embedded `resource` — never a `resource_link`, which is
 * the whole of ADR-0004. Base64 happens here because the encoding is the wire's business.
 *
 * The `uri` is the file's own name when it had one. A pasted image has none and is given none:
 * an invented `pasted-image-1.png` is a filename in an agent's context for a file that exists
 * nowhere under it, and the agent will repeat it back.
 */
export function contentBlockOf(attachment: PromptAttachment): unknown {
  const data = base64(attachment.data);
  if (attachment.kind === 'image') {
    return {
      type: 'image',
      mimeType: attachment.mimeType,
      data,
      ...(attachment.name === undefined ? {} : { uri: fileUri(attachment.name) }),
    };
  }
  return {
    type: 'resource',
    resource: {
      // Required by the schema, unlike an image's. A `.ts` arriving anonymous is a wall of code
      // with no context, so a text attachment always carries its name.
      uri: fileUri(attachment.name ?? 'attachment.txt'),
      mimeType: attachment.mimeType,
      text: new TextDecoder().decode(attachment.data),
    },
  };
}

/**
 * A name, as a URI, and deliberately not a path.
 *
 * `attachment:` rather than `file:`: there is no file at that location and blobot will not
 * imply one. The bytes are in the block beside it; this is a label.
 */
function fileUri(name: string): string {
  return `attachment:///${encodeURIComponent(name)}`;
}

function base64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}
