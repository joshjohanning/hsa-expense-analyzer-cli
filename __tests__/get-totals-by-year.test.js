import { getTotalsByYear } from '../src/main.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDataDir = join(__dirname, '../test-data');

describe('getTotalsByYear', () => {
  test('should calculate totals from test-data directory', () => {
    const result = getTotalsByYear(testDataDir);

    expect(result.expensesByYear).toBeDefined();
    expect(result.reimbursementsByYear).toBeDefined();
    expect(result.receiptCounts).toBeDefined();
    expect(result.invalidFiles).toBeDefined();

    // Test that we have data for expected years
    expect(Object.keys(result.expensesByYear).length).toBeGreaterThan(0);
  });

  test('should identify invalid files', () => {
    const result = getTotalsByYear(testDataDir);

    // We know test-data has invalid files
    expect(result.invalidFiles.length).toBeGreaterThan(0);

    // Each invalid file should have fileName and error
    for (const file of result.invalidFiles) {
      expect(file).toHaveProperty('fileName');
      expect(file).toHaveProperty('error');
      expect(typeof file.fileName).toBe('string');
      expect(typeof file.error).toBe('string');
    }
  });

  test('should calculate expenses correctly', () => {
    const result = getTotalsByYear(testDataDir);

    // All expenses should be positive numbers
    for (const expense of Object.values(result.expensesByYear)) {
      expect(expense).toBeGreaterThan(0);
      expect(Number.isFinite(expense)).toBe(true);
    }
  });

  test('should calculate reimbursements correctly', () => {
    const result = getTotalsByYear(testDataDir);

    // All reimbursements should be non-negative numbers
    for (const reimbursement of Object.values(result.reimbursementsByYear)) {
      expect(reimbursement).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(reimbursement)).toBe(true);
    }
  });

  test('should count receipts correctly', () => {
    const result = getTotalsByYear(testDataDir);

    // All receipt counts should be positive integers
    for (const count of Object.values(result.receiptCounts)) {
      expect(count).toBeGreaterThan(0);
      expect(Number.isInteger(count)).toBe(true);
    }
  });

  test('should have matching years across all data structures', () => {
    const result = getTotalsByYear(testDataDir);

    const expenseYears = Object.keys(result.expensesByYear);
    const reimbursementYears = Object.keys(result.reimbursementsByYear);
    const receiptYears = Object.keys(result.receiptCounts);

    // All years should match
    expect(expenseYears.sort()).toEqual(reimbursementYears.sort());
    expect(expenseYears.sort()).toEqual(receiptYears.sort());
  });

  test('should handle directory with no valid files gracefully', () => {
    // This will throw/exit, but we're testing the error handling exists
    expect(() => {
      getTotalsByYear('/nonexistent/directory');
    }).toThrow();
  });

  test('should ignore hidden files starting with dot', () => {
    // Test-data now has .DS_Store and .hidden-file which should be ignored
    const result = getTotalsByYear(testDataDir);

    // Hidden files should not appear in invalidFiles
    const hiddenFileNames = result.invalidFiles.map(f => f.fileName).filter(name => name.startsWith('.'));
    expect(hiddenFileNames.length).toBe(0);

    // Results should still be valid
    expect(result.expensesByYear).toBeDefined();
    expect(Object.keys(result.expensesByYear).length).toBeGreaterThan(0);
  });

  test('should use "uncategorized" for empty description category', async () => {
    const fs = (await import('fs')).default;
    const os = (await import('os')).default;
    const path = (await import('path')).default;

    // Create a temp directory with a file that has empty-ish description
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hsa-test-'));
    const testFile = '2021-01-01 -  - $50.00.pdf'; // Empty description (just spaces)
    fs.writeFileSync(path.join(tempDir, testFile), '');

    try {
      const result = getTotalsByYear(tempDir);

      // Should have expensesByCategory with 'uncategorized' key
      expect(result.expensesByCategory['2021']).toBeDefined();
      expect(result.expensesByCategory['2021']['uncategorized']).toBeDefined();
      expect(result.expensesByCategory['2021']['uncategorized'].expenses).toBe(50.0);
    } finally {
      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  test('should treat categories case-insensitively', async () => {
    const fs = (await import('fs')).default;
    const os = (await import('os')).default;
    const path = (await import('path')).default;

    // Create a temp directory with files that have different casing
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hsa-test-'));
    fs.writeFileSync(path.join(tempDir, '2021-01-01 - Josh doctor - $50.00.pdf'), '');
    fs.writeFileSync(path.join(tempDir, '2021-01-02 - josh dentist - $30.00.pdf'), '');
    fs.writeFileSync(path.join(tempDir, '2021-01-03 - JOSH vision - $20.00.pdf'), '');

    try {
      const result = getTotalsByYear(tempDir);

      // All should be grouped under 'josh' (lowercase)
      expect(result.expensesByCategory['2021']).toBeDefined();
      expect(result.expensesByCategory['2021']['josh']).toBeDefined();
      expect(result.expensesByCategory['2021']['josh'].expenses).toBe(100.0);
      expect(result.expensesByCategory['2021']['josh'].count).toBe(3);

      // Should not have separate entries for different casings
      expect(result.expensesByCategory['2021']['Josh']).toBeUndefined();
      expect(result.expensesByCategory['2021']['JOSH']).toBeUndefined();
    } finally {
      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    }
  });
});
