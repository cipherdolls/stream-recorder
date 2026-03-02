const CHAT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function sanitizeChatId(raw: string | null): string {
  if (!raw || !CHAT_ID_PATTERN.test(raw)) {
    throw new Error(`Invalid chatId: "${raw}"`);
  }
  return raw;
}
