export type SourceOrigin =
  | { readonly kind: "direct" }
  | {
      readonly kind: "markdown-fence";
      readonly fileId: string;
      readonly blockIndex: number;
      readonly blockStartOffset: number;
      readonly blockStartLine: number;
      readonly blockStartColumn: number;
    };

export interface Source {
  readonly id: string;
  readonly text: string;
  readonly origin?: SourceOrigin | undefined;
  readonly hash: string;
}

export interface SourceInput {
  readonly id: string;
  readonly text: string;
  readonly origin?: SourceOrigin | undefined;
}

export function makeSource(input: SourceInput): Source {
  return {
    id: input.id,
    text: input.text,
    ...(input.origin ? { origin: input.origin } : {}),
    hash: hashSourceText(input.text),
  };
}

export function hashSourceText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
