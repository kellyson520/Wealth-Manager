export function hasExplicitToolConfirmation(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');
  if (!normalized) return false;
  if (/(不确认|未确认|不要确认|别确认|取消|不要删|别删)/.test(normalized)) return false;
  return /(确认删除|确定删除|我确认|已确认|确认执行|确定执行|同意执行|可以删除|删吧|删除吧)/.test(normalized);
}

export function applyUserConfirmationToToolArgs(
  args: Record<string, unknown>,
  userText: string
): Record<string, unknown> {
  if (hasExplicitToolConfirmation(userText)) {
    return { ...args, confirmed: true };
  }
  if (args.confirmed === undefined) return args;
  return { ...args, confirmed: false };
}
