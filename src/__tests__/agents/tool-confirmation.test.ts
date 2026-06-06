import {
  applyUserConfirmationToToolArgs,
  hasExplicitToolConfirmation,
} from '../../agents/master/tool-confirmation';

describe('Tool confirmation parsing', () => {
  test.each([
    '确认删除这条账单',
    '确定删除账单 abc',
    '我确认执行这个敏感操作',
    '删除吧',
  ])('accepts explicit confirmation phrase "%s"', (input) => {
    expect(hasExplicitToolConfirmation(input)).toBe(true);
  });

  test.each([
    '删除这条账单',
    '不要确认删除',
    '不确认删除这条账单',
    '别删这条账单',
    '',
  ])('rejects non-confirming or negated phrase "%s"', (input) => {
    expect(hasExplicitToolConfirmation(input)).toBe(false);
  });

  test('does not trust model-provided confirmation without explicit user text', () => {
    expect(
      applyUserConfirmationToToolArgs({ billId: 'bill-1', confirmed: true }, '删除这条账单')
    ).toEqual({ billId: 'bill-1', confirmed: false });
  });

  test('allows confirmation only when user text is explicit', () => {
    expect(
      applyUserConfirmationToToolArgs({ billId: 'bill-1', confirmed: false }, '确认删除这条账单')
    ).toEqual({ billId: 'bill-1', confirmed: true });
  });

  test('leaves unrelated args untouched when no confirmation field exists', () => {
    expect(
      applyUserConfirmationToToolArgs({ billId: 'bill-1' }, '删除这条账单')
    ).toEqual({ billId: 'bill-1' });
  });
});
