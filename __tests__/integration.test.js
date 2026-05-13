import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// ANSI escape code regex for stripping color codes
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

// Expected test results - update these if test data changes
const EXPECTED_INVALID_FILES = 16;
const EXPECTED_TOTAL_EXPENSES = '600.00';
const EXPECTED_TOTAL_REIMBURSEMENTS = '185.00';
const EXPECTED_TOTAL_RECEIPTS = '9';

describe('hsa-expense-analyzer-cli', () => {
  let output;

  beforeAll(() => {
    // Run the main script on test-data directory and capture output
    output = execSync('node src/main.js --dirPath=test-data/ --no-color', {
      encoding: 'utf8',
      cwd: rootDir
    });
  });

  test('should process files and generate output', () => {
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  test('should find expected number of invalid files', () => {
    const lines = output.split('\n');
    let inErrorSection = false;
    let errorCount = 0;
    let foundHeaderLine = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Strip ANSI color codes for easier parsing
      const cleanLine = line.replace(ANSI_REGEX, '');

      if (cleanLine.includes('⚠️  WARNING: The following files do not match the expected pattern')) {
        inErrorSection = true;
        continue;
      }

      if (inErrorSection && cleanLine.includes('Filename') && cleanLine.includes('Error')) {
        foundHeaderLine = true;
        continue;
      }

      if (inErrorSection && cleanLine.includes('--------') && cleanLine.includes('-----')) {
        continue; // Skip the separator line
      }

      if (inErrorSection && foundHeaderLine && cleanLine.trim() === '') {
        break; // End of error section
      }

      if (
        inErrorSection &&
        foundHeaderLine &&
        cleanLine.trim() !== '' &&
        !cleanLine.includes('Filename') &&
        !cleanLine.includes('--------')
      ) {
        errorCount++;
      }
    }

    expect(errorCount).toBe(EXPECTED_INVALID_FILES);
  });

  test('should calculate correct total expenses', () => {
    const outputText = output.replace(ANSI_REGEX, ''); // Strip ANSI codes
    expect(outputText).toContain(`expenses:       $${EXPECTED_TOTAL_EXPENSES}`);
  });

  test('should calculate correct total reimbursements', () => {
    const outputText = output.replace(ANSI_REGEX, ''); // Strip ANSI codes
    expect(outputText).toContain(`reimbursements: $${EXPECTED_TOTAL_REIMBURSEMENTS}`);
  });

  test('should count correct total receipts', () => {
    const outputText = output.replace(ANSI_REGEX, ''); // Strip ANSI codes
    expect(outputText).toContain(`receipts:       ${EXPECTED_TOTAL_RECEIPTS}`);
  });

  test('should display summary statistics', () => {
    expect(output).toContain('📊 Summary Statistics');
    expect(output).toContain('Total Receipts Processed:');
    expect(output).toContain('Total Expenses:');
    expect(output).toContain('Total Reimbursements:');
  });

  test('should display charts (unless summary-only mode)', () => {
    expect(output).toContain('Expenses by year');
  });
});
