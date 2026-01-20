import { buildYearlyResultObject } from '../src/main.js';

describe('buildYearlyResultObject', () => {
  test('should build result object with yearly data and totals', () => {
    const years = ['2021', '2022'];
    const expensesByYear = { 2021: 100.5, 2022: 250.75 };
    const reimbursementsByYear = { 2021: 50.25, 2022: 100.0 };
    const receiptCounts = { 2021: 2, 2022: 5 };

    const result = buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts);

    expect(result['2021']).toEqual({
      expenses: '$100.50',
      reimbursements: '$50.25',
      receipts: 2
    });

    expect(result['2022']).toEqual({
      expenses: '$250.75',
      reimbursements: '$100.00',
      receipts: 5
    });

    expect(result['Total']).toEqual({
      expenses: '$351.25',
      reimbursements: '$150.25',
      receipts: 7
    });
  });

  test('should handle empty years array', () => {
    const years = [];
    const expensesByYear = {};
    const reimbursementsByYear = {};
    const receiptCounts = {};

    const result = buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts);

    expect(result['Total']).toEqual({
      expenses: '$0.00',
      reimbursements: '$0.00',
      receipts: 0
    });
  });

  test('should handle single year', () => {
    const years = ['2023'];
    const expensesByYear = { 2023: 500.99 };
    const reimbursementsByYear = { 2023: 0 };
    const receiptCounts = { 2023: 10 };

    const result = buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts);

    expect(result['2023']).toEqual({
      expenses: '$500.99',
      reimbursements: '$0.00',
      receipts: 10
    });

    expect(result['Total']).toEqual({
      expenses: '$500.99',
      reimbursements: '$0.00',
      receipts: 10
    });
  });

  test('should format decimal places correctly', () => {
    const years = ['2024'];
    const expensesByYear = { 2024: 123.456 }; // Should round to 2 decimal places
    const reimbursementsByYear = { 2024: 50.1 }; // Should pad to 2 decimal places
    const receiptCounts = { 2024: 1 };

    const result = buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts);

    expect(result['2024'].expenses).toBe('$123.46');
    expect(result['2024'].reimbursements).toBe('$50.10');
  });

  test('should include byPerson breakdown when expensesByPerson is provided', () => {
    const years = ['2021', '2022'];
    const expensesByYear = { 2021: 150.0, 2022: 200.0 };
    const reimbursementsByYear = { 2021: 50.0, 2022: 100.0 };
    const receiptCounts = { 2021: 3, 2022: 2 };
    const expensesByPerson = {
      2021: {
        josh: { expenses: 100.0, reimbursements: 50.0, count: 2 },
        household: { expenses: 50.0, reimbursements: 0, count: 1 }
      },
      2022: {
        sage: { expenses: 200.0, reimbursements: 100.0, count: 2 }
      }
    };

    const result = buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts, expensesByPerson);

    expect(result['2021'].byPerson).toEqual({
      josh: { expenses: '$100.00', reimbursements: '$50.00', receipts: 2 },
      household: { expenses: '$50.00', reimbursements: '$0.00', receipts: 1 }
    });

    expect(result['2022'].byPerson).toEqual({
      sage: { expenses: '$200.00', reimbursements: '$100.00', receipts: 2 }
    });

    // Total should not have byPerson
    expect(result['Total'].byPerson).toBeUndefined();
  });

  test('should sort byPerson by expenses descending', () => {
    const years = ['2021'];
    const expensesByYear = { 2021: 300.0 };
    const reimbursementsByYear = { 2021: 0 };
    const receiptCounts = { 2021: 3 };
    const expensesByPerson = {
      2021: {
        low: { expenses: 50.0, reimbursements: 0, count: 1 },
        high: { expenses: 200.0, reimbursements: 0, count: 1 },
        mid: { expenses: 50.0, reimbursements: 0, count: 1 }
      }
    };

    const result = buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts, expensesByPerson);

    const personKeys = Object.keys(result['2021'].byPerson);
    expect(personKeys[0]).toBe('high'); // Highest expenses first
  });

  test('should not include byPerson when expensesByPerson is empty', () => {
    const years = ['2021'];
    const expensesByYear = { 2021: 100.0 };
    const reimbursementsByYear = { 2021: 0 };
    const receiptCounts = { 2021: 1 };
    const expensesByPerson = {};

    const result = buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts, expensesByPerson);

    expect(result['2021'].byPerson).toBeUndefined();
  });
});
