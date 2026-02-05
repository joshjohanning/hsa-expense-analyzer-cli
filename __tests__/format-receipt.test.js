import { formatReceipt, formatReceiptList } from '../src/main.js';

describe('formatReceipt', () => {
  const sampleReceipt = {
    date: '2023-05-15',
    description: 'josh dentist cleaning',
    amount: 150.0,
    isReimbursed: false,
    category: 'josh'
  };

  const reimbursedReceipt = {
    date: '2023-06-20',
    description: 'jane doctor visit',
    amount: 75.5,
    isReimbursed: true,
    category: 'jane'
  };

  test('should format receipt with reimbursed status by default', () => {
    const result = formatReceipt(sampleReceipt);
    expect(result).toBe('2023-05-15 | josh dentist cleaning | $150.00 | not reimbursed');
  });

  test('should show reimbursed status when receipt is reimbursed', () => {
    const result = formatReceipt(reimbursedReceipt);
    expect(result).toBe('2023-06-20 | jane doctor visit | $75.50 | reimbursed');
  });

  test('should format receipt without reimbursed status when includeReimbursedStatus is false', () => {
    const result = formatReceipt(sampleReceipt, false);
    expect(result).toBe('2023-05-15 | josh dentist cleaning | $150.00');
  });

  test('should format amount with two decimal places', () => {
    const receipt = { ...sampleReceipt, amount: 100 };
    const result = formatReceipt(receipt);
    expect(result).toContain('$100.00');
  });

  test('should handle amounts with many decimal places', () => {
    const receipt = { ...sampleReceipt, amount: 99.999 };
    const result = formatReceipt(receipt);
    expect(result).toContain('$100.00'); // toFixed(2) rounds
  });
});

describe('formatReceiptList', () => {
  const receipts = [
    {
      date: '2023-01-10',
      description: 'josh pharmacy',
      amount: 25.0,
      isReimbursed: false,
      category: 'josh'
    },
    {
      date: '2023-02-15',
      description: 'jane dentist',
      amount: 200.0,
      isReimbursed: true,
      category: 'jane'
    },
    {
      date: '2023-03-20',
      description: 'household walgreens',
      amount: 50.0,
      isReimbursed: false,
      category: 'household'
    }
  ];

  test('should format multiple receipts with newlines', () => {
    const result = formatReceiptList(receipts);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
  });

  test('should include reimbursed status by default', () => {
    const result = formatReceiptList(receipts);
    expect(result).toContain('not reimbursed');
    expect(result).toContain('reimbursed');
  });

  test('should exclude reimbursed status when includeReimbursedStatus is false', () => {
    const result = formatReceiptList(receipts, false);
    expect(result).not.toContain('not reimbursed');
    expect(result).not.toContain('| reimbursed');
  });

  test('should handle empty array', () => {
    const result = formatReceiptList([]);
    expect(result).toBe('');
  });

  test('should handle single receipt', () => {
    const result = formatReceiptList([receipts[0]]);
    expect(result).toBe('2023-01-10 | josh pharmacy | $25.00 | not reimbursed');
  });

  test('should preserve receipt order', () => {
    const result = formatReceiptList(receipts);
    const lines = result.split('\n');
    expect(lines[0]).toContain('josh pharmacy');
    expect(lines[1]).toContain('jane dentist');
    expect(lines[2]).toContain('household walgreens');
  });
});
