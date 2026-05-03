/**
 * Mini Claude client — routes Claude calls through Stephen's Mac Mini
 * (running claude CLI under Max OAuth) instead of the metered Anthropic API.
 *
 * Drop-in for the small subset of @anthropic-ai/sdk used in this repo:
 *   const client = new MiniClaude();
 *   const message = await client.messages.create({ model, max_tokens, system, messages });
 *   const text = extractText(message.content);
 *
 * Env (Vercel + .env):
 *   MINI_CLAUDE_URL    e.g. https://stephens-mac-mini.tailcac25b.ts.net:8443/claude
 *   MINI_CLAUDE_TOKEN  shared secret bearer token
 */

interface ImageBlock {
  type: "image";
  source:
    | { type: "base64"; media_type: string; data: string }
    | { type: "url"; data: string };
}
interface TextBlock {
  type: "text";
  text: string;
}
type ContentBlock = TextBlock | ImageBlock;

interface MessagesCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }>;
}

interface MessagesCreateResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<{ type: "text"; text: string }>;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

export class MiniClaudeError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "MiniClaudeError";
  }
}

export class MiniClaude {
  private url: string;
  private token: string;

  constructor(opts: { url?: string; token?: string } = {}) {
    const url = opts.url ?? import.meta.env.MINI_CLAUDE_URL ?? process.env.MINI_CLAUDE_URL;
    const token = opts.token ?? import.meta.env.MINI_CLAUDE_TOKEN ?? process.env.MINI_CLAUDE_TOKEN;
    if (!url) throw new MiniClaudeError("MINI_CLAUDE_URL not set");
    if (!token) throw new MiniClaudeError("MINI_CLAUDE_TOKEN not set");
    this.url = url.replace(/\/$/, "");
    this.token = token;
  }

  messages = {
    create: async (params: MessagesCreateParams): Promise<MessagesCreateResponse> => {
      const res = await fetch(`${this.url}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new MiniClaudeError(
          `Mini Claude ${res.status}: ${body.slice(0, 300)}`,
          res.status,
        );
      }
      return (await res.json()) as MessagesCreateResponse;
    },
  };
}
