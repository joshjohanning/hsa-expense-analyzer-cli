import { parseFileName } from '../src/main.js';

describe('parseFileName', () => {
  test('should parse valid expense file', () => {
    const result = parseFileName('2021-01-15 - doctor - $50.00.pdf');
    expect(result).toEqual({
      year: '2021',
      description: 'doctor',
      amount: 50.0,
      isReimbursement: false,
      isValid: true
    });
  });

  test('should parse valid reimbursed expense file', () => {
    const result = parseFileName('2021-02-20 - pharmacy - $30.50.reimbursed.pdf');
    expect(result).toEqual({
      year: '2021',
      description: 'pharmacy',
      amount: 30.5,
      isReimbursement: true,
      isValid: true
    });
  });

  test('should handle different file extensions', () => {
    const pdfResult = parseFileName('2022-03-10 - dentist - $100.00.pdf');
    const jpgResult = parseFileName('2022-03-10 - dentist - $100.00.jpg');
    const pngResult = parseFileName('2022-03-10 - dentist - $100.00.png');

    expect(pdfResult.isValid).toBe(true);
    expect(jpgResult.isValid).toBe(true);
    expect(pngResult.isValid).toBe(true);
  });

  test('should reject file with missing date', () => {
    const result = parseFileName('doctor - $50.00.pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('File name should have format');
  });

  test('should reject file with invalid date format', () => {
    const result = parseFileName('2021-1-5 - doctor - $50.00.pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('should be yyyy-mm-dd format');
  });

  test('should reject file with invalid date', () => {
    const result = parseFileName('2021-13-01 - doctor - $50.00.pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('should be yyyy-mm-dd format');
  });

  test('should reject file without dollar sign', () => {
    const result = parseFileName('2021-01-15 - doctor - 50.00.pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('should start with $');
  });

  test('should reject file with wrong amount format', () => {
    const result = parseFileName('2021-01-15 - doctor - $50.pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('should be a valid format like $50.00');
  });

  test('should reject file with comma in amount', () => {
    const result = parseFileName('2021-01-15 - doctor - $1,000.00.pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('should be a valid format like $50.00');
  });

  test('should reject file without extension', () => {
    const result = parseFileName('2021-01-15 - doctor - $50.00');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('missing extension');
  });

  test('should reject file with missing spaces around dashes', () => {
    const result = parseFileName('2021-01-15- doctor - $50.00.pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('File name should have format');
  });

  test('should parse large amounts correctly', () => {
    const result = parseFileName('2023-05-01 - surgery - $9999.99.pdf');
    expect(result).toEqual({
      year: '2023',
      description: 'surgery',
      amount: 9999.99,
      isReimbursement: false,
      isValid: true
    });
  });

  test('should parse reimbursed file with different extensions', () => {
    const result = parseFileName('2022-06-15 - glasses - $250.00.reimbursed.jpg');
    expect(result).toEqual({
      year: '2022',
      description: 'glasses',
      amount: 250.0,
      isReimbursement: true,
      isValid: true
    });
  });

  test('should reject file with non-numeric amount', () => {
    const result = parseFileName('2021-01-15 - doctor - $abc.00.pdf');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('should be a valid format');
  });

  test('should reject file with NaN amount', () => {
    const result = parseFileName('2021-01-15 - doctor - $NaN.pdf');
    expect(result.isValid).toBe(false);
  });
});
