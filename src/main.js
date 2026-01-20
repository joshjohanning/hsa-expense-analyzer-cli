#!/usr/bin/env node

import fs, { readFileSync } from 'fs';
import prettyjson from 'prettyjson';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chartscii from 'chartscii';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

// Configuration constants
const COLUMN_PADDING = 4; // Extra padding for table columns in file parsing display

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

// Helper function for colored output
function colorize(text, color) {
  if (process.argv.includes('--no-color')) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

function parseFileName(fileName) {
  const parts = fileName.split(' - ');
  if (parts.length !== 3) {
    return {
      year: null,
      description: null,
      amount: 0,
      isReimbursement: false,
      isValid: false,
      error: `File name should have format "yyyy-mm-dd - description - $amount.ext"`
    };
  }

  const date = parts[0];
  const description = parts[1];
  const amountPart = parts[2];

  // Validate date format (yyyy-mm-dd)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      year: null,
      amount: 0,
      isReimbursement: false,
      isValid: false,
      error: `Date "${date}" should be yyyy-mm-dd format`
    };
  }

  // Validate that it's actually a valid date
  const dateObj = new Date(`${date}T00:00:00`); // Add time to avoid timezone issues
  const [yearNum, monthNum, dayNum] = date.split('-').map(Number);
  if (dateObj.getFullYear() !== yearNum || dateObj.getMonth() !== monthNum - 1 || dateObj.getDate() !== dayNum) {
    return {
      year: null,
      amount: 0,
      isReimbursement: false,
      isValid: false,
      error: `Date "${date}" should be yyyy-mm-dd format`
    };
  }

  // Check if amount starts with $
  if (!amountPart || !amountPart.startsWith('$')) {
    return {
      year: null,
      amount: 0,
      isReimbursement: false,
      isValid: false,
      error: `Amount "${amountPart}" should start with $`
    };
  }

  // Check if the filename has a proper file extension (ends with .ext pattern)
  if (!/\.[a-zA-Z]{2,5}$/.test(amountPart)) {
    return {
      year: null,
      amount: 0,
      isReimbursement: false,
      isValid: false,
      error: `File is missing extension (should end with .pdf, .jpg, etc.)`
    };
  }

  // Parse the amount - be more strict about format
  let amountStr = amountPart.substring(1); // Remove the $

  // Handle .reimbursed. files - remove .reimbursed.ext pattern
  if (amountStr.includes('.reimbursed.')) {
    amountStr = amountStr.replace(/\.reimbursed\..+$/, '');
  } else {
    // Remove regular file extension (.pdf, .jpg, etc.)
    amountStr = amountStr.replace(/\.[^.]+$/, '');
  }

  // Check for valid decimal number format (digits with optional .digits, no commas)
  if (!/^\d+\.\d{2}$/.test(amountStr)) {
    return {
      year: null,
      amount: 0,
      isReimbursement: false,
      isValid: false,
      error: `Amount "${amountPart}" should be a valid format like $50.00`
    };
  }

  const amount = parseFloat(amountStr);

  if (isNaN(amount)) {
    return {
      year: null,
      amount: 0,
      isReimbursement: false,
      isValid: false,
      error: `Amount "${amountPart}" should be a valid number`
    };
  }

  const year = date.split('-')[0];

  // Check if this is a reimbursement
  const isReimbursement = fileName.includes('.reimbursed.');

  return { year, description, amount, isReimbursement, isValid: true };
}

function getTotalsByYear(directory) {
  const expensesByYear = {};
  const reimbursementsByYear = {};
  const receiptCounts = {};
  const invalidFiles = [];
  const expensesByPerson = {}; // { year: { person: { expenses: number, reimbursements: number, count: number } } }

  let fileNames;
  try {
    fileNames = fs.readdirSync(directory);
  } catch (error) {
    // Throw error for testability - caller (main function) will handle console output and exit
    throw new Error(`Cannot access directory: ${error.message}`);
  }

  for (const fileName of fileNames) {
    if (fileName.startsWith('.')) {
      continue;
    }

    const { year, description, amount, isReimbursement, isValid, error } = parseFileName(fileName);

    if (!isValid) {
      invalidFiles.push({ fileName, error });
      continue;
    }

    // Extract just the first word as the person name
    const person = description.trim().split(' ')[0].toLowerCase();

    if (amount > 0) {
      // Initialize year data if not exists
      if (!expensesByYear[year]) {
        expensesByYear[year] = 0;
        reimbursementsByYear[year] = 0;
        receiptCounts[year] = 0;
        expensesByPerson[year] = {};
      }

      // Initialize person data if not exists for this year
      if (!expensesByPerson[year][person]) {
        expensesByPerson[year][person] = { expenses: 0, reimbursements: 0, count: 0 };
      }

      // Always count as an expense regardless of reimbursement status
      expensesByYear[year] = +(expensesByYear[year] + amount).toFixed(2);
      expensesByPerson[year][person].expenses = +(expensesByPerson[year][person].expenses + amount).toFixed(2);
      expensesByPerson[year][person].count++;

      // Additionally track as reimbursement if applicable
      if (isReimbursement) {
        reimbursementsByYear[year] = +(reimbursementsByYear[year] + amount).toFixed(2);
        expensesByPerson[year][person].reimbursements = +(
          expensesByPerson[year][person].reimbursements + amount
        ).toFixed(2);
      }

      receiptCounts[year]++;
    }
  }

  return { expensesByYear, reimbursementsByYear, receiptCounts, invalidFiles, expensesByPerson };
}

function calculateSummaryStats(years, expensesByYear, reimbursementsByYear, receiptCounts, invalidFiles) {
  const totalValidFiles = Object.values(receiptCounts).reduce((sum, count) => sum + count, 0);
  const totalInvalidFiles = invalidFiles.length;
  const totalFiles = totalValidFiles + totalInvalidFiles;

  let totalExpenses = 0;
  let totalReimbursements = 0;

  for (const year of years) {
    totalExpenses += expensesByYear[year] || 0;
    totalReimbursements += reimbursementsByYear[year] || 0;
  }

  const invalidFilePercentage = totalFiles > 0 ? ((totalInvalidFiles / totalFiles) * 100).toFixed(1) : 0;
  const avgExpensePerYear = years.length > 0 ? (totalExpenses / years.length).toFixed(2) : 0;
  const avgReceiptsPerYear = years.length > 0 ? Math.round(totalValidFiles / years.length) : 0;
  const reimbursementRate = totalExpenses > 0 ? ((totalReimbursements / totalExpenses) * 100).toFixed(1) : 0;
  const totalReimburseable = totalExpenses - totalReimbursements;
  const reimburseableRate = totalExpenses > 0 ? ((totalReimburseable / totalExpenses) * 100).toFixed(1) : 0;

  // Find the most expensive year
  let mostExpensiveYear = null;
  let mostExpensiveYearAmount = 0;
  let mostExpensiveYearReceipts = 0;

  if (years.length > 0) {
    mostExpensiveYear = years.reduce((maxYear, year) =>
      (expensesByYear[year] || 0) > (expensesByYear[maxYear] || 0) ? year : maxYear
    );
    mostExpensiveYearReceipts = receiptCounts[mostExpensiveYear] || 0;
    mostExpensiveYearAmount = expensesByYear[mostExpensiveYear] || 0;
  }

  const expensePercentage = totalExpenses > 0 ? ((mostExpensiveYearAmount / totalExpenses) * 100).toFixed(1) : 0;
  const receiptPercentage = totalValidFiles > 0 ? ((mostExpensiveYearReceipts / totalValidFiles) * 100).toFixed(1) : 0;

  return {
    totalFiles,
    totalValidFiles,
    totalInvalidFiles,
    invalidFilePercentage,
    totalExpenses,
    totalReimbursements,
    totalReimburseable,
    reimbursementRate,
    reimburseableRate,
    avgExpensePerYear,
    avgReceiptsPerYear,
    mostExpensiveYear,
    mostExpensiveYearAmount,
    mostExpensiveYearReceipts,
    expensePercentage,
    receiptPercentage
  };
}

function buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts, expensesByPerson = {}) {
  const result = {};
  let totalExpenses = 0;
  let totalReimbursements = 0;
  let totalReceipts = 0;

  for (const year of years) {
    const yearExpenses = expensesByYear[year] || 0;
    const yearReimbursements = reimbursementsByYear[year] || 0;
    const yearReceipts = receiptCounts[year] || 0;

    totalExpenses += yearExpenses;
    totalReimbursements += yearReimbursements;
    totalReceipts += yearReceipts;

    result[year] = {
      expenses: `$${yearExpenses.toFixed(2)}`,
      reimbursements: `$${yearReimbursements.toFixed(2)}`,
      receipts: yearReceipts
    };

    // Add person breakdown if available
    if (expensesByPerson[year]) {
      const byPerson = {};
      // Sort by expenses descending
      const sortedPersons = Object.entries(expensesByPerson[year]).sort((a, b) => b[1].expenses - a[1].expenses);

      for (const [person, data] of sortedPersons) {
        byPerson[person] = {
          expenses: `$${data.expenses.toFixed(2)}`,
          reimbursements: `$${data.reimbursements.toFixed(2)}`,
          receipts: data.count
        };
      }
      result[year].byPerson = byPerson;
    }
  }

  result['Total'] = {
    expenses: `$${totalExpenses.toFixed(2)}`,
    reimbursements: `$${totalReimbursements.toFixed(2)}`,
    receipts: totalReceipts
  };

  return result;
}

function prepareChartData(years, expensesByYear, reimbursementsByYear) {
  const expenseData = [];
  const reimbursementData = [];

  for (const year of years) {
    const expenseAmount = expensesByYear[year] || 0;
    const reimbursementAmount = reimbursementsByYear[year] || 0;

    expenseData.push({
      label: year,
      value: expenseAmount
    });

    reimbursementData.push({
      label: year,
      value: reimbursementAmount
    });
  }

  return { expenseData, reimbursementData };
}

// Main CLI execution
function main() {
  const argv = yargs(hideBin(process.argv))
    .scriptName('hsa-expense-analyzer')
    .version(packageJson.version)
    .usage('A Node.js CLI tool that analyzes HSA expenses and reimbursements by year from receipt files. 📊\n')
    .usage('Usage: $0 --dirPath <path>')
    .option('dirPath', {
      alias: 'd',
      type: 'string',
      demandOption: true,
      describe: 'The directory path containing receipt files'
    })
    .option('no-color', {
      type: 'boolean',
      default: false,
      describe: 'Disable colored output'
    })
    .option('summary-only', {
      type: 'boolean',
      default: false,
      describe: 'Show only summary statistics'
    })
    .option('by-person', {
      type: 'boolean',
      default: false,
      describe: 'Show breakdown by person (uses first word of description)'
    })
    .epilogue(
      `Expected file format:
  <yyyy-mm-dd> - <description> - $<amount>.<ext>
  <yyyy-mm-dd> - <description> - $<amount>.reimbursed.<ext>`
    )
    .help()
    .alias('h', 'help')
    .alias('v', 'version')
    .wrap(100).argv;

  const dirPath = argv.dirPath;

  let expensesByYear;
  let reimbursementsByYear;
  let receiptCounts;
  let invalidFiles;
  let expensesByPerson;
  try {
    ({ expensesByYear, reimbursementsByYear, receiptCounts, invalidFiles, expensesByPerson } =
      getTotalsByYear(dirPath));
  } catch (error) {
    console.error(colorize(`❌ Error: Cannot access directory`, 'red'));
    console.error(colorize(`   ${error.message.replace('Cannot access directory: ', '')}`, 'dim'));
    process.exit(1);
  }

  // Check if no valid files were found
  const years = [...new Set([...Object.keys(expensesByYear), ...Object.keys(reimbursementsByYear)])].sort();
  if (years.length === 0) {
    console.log(colorize('❌ Error: No valid receipt files found in the specified directory', 'red'));
    console.log(colorize('Expected pattern: <yyyy-mm-dd> - <description> - $<amount>.<ext>', 'dim'));
    process.exit(1);
  }

  // Display any invalid files
  if (invalidFiles.length > 0) {
    // Calculate dynamic padding based on longest filename + buffer
    const maxFileNameLength = Math.max(...invalidFiles.map(f => f.fileName.length));
    // Subtract padding for no-color (compact), add padding for color (spacing)
    const extraPadding = process.argv.includes('--no-color') ? -COLUMN_PADDING - 1 : COLUMN_PADDING;
    const padding = Math.max(maxFileNameLength + extraPadding, 'Filename'.length + extraPadding);

    console.log(colorize('⚠️  WARNING: The following files do not match the expected pattern', 'yellow'));
    console.log(colorize('Expected pattern: <yyyy-mm-dd> - <description> - $<amount>.<ext>', 'dim'));
    console.log(
      `\n${colorize('Filename', 'cyan').padEnd(padding + colors.cyan.length + colors.reset.length)}${colorize('Error', 'cyan')}`
    );
    console.log(
      `${colorize('--------', 'cyan').padEnd(padding + colors.cyan.length + colors.reset.length)}${colorize('-----', 'cyan')}`
    );
    for (const { fileName, error } of invalidFiles) {
      console.log(
        `${colorize(fileName, 'yellow').padEnd(padding + colors.yellow.length + colors.reset.length)}${colorize(error, 'red')}`
      );
    }
    console.log();
  }

  const result = buildYearlyResultObject(
    years,
    expensesByYear,
    reimbursementsByYear,
    receiptCounts,
    argv['by-person'] ? expensesByPerson : {}
  );

  // Show data table and charts unless summary-only mode
  if (!argv['summary-only']) {
    console.log(prettyjson.render(result));
    console.log();

    const { expenseData, reimbursementData } = prepareChartData(years, expensesByYear, reimbursementsByYear);

    const chart = new chartscii(expenseData, {
      width: 20,
      height: years.length,
      title: 'Expenses by year',
      fill: '░',
      valueLabels: true,
      valueLabelsPrefix: '$',
      valueLabelsFloatingPoint: 2
    });

    const reimbursementChart = new chartscii(reimbursementData, {
      width: 20,
      height: years.length,
      title: 'Reimbursements by year',
      fill: '░',
      valueLabels: true,
      valueLabelsPrefix: '$',
      valueLabelsFloatingPoint: 2
    });

    console.log(chart.create());
    console.log();
    console.log(reimbursementChart.create());
    console.log();

    // Create a manual comparison chart
    console.log('Expenses vs Reimbursements by year');
    const maxValue = Math.max(...Object.values(expensesByYear), ...Object.values(reimbursementsByYear));

    for (const year of years) {
      const expenseAmount = expensesByYear[year] || 0;
      const reimbursementAmount = reimbursementsByYear[year] || 0;

      const expenseBarLength = Math.floor((expenseAmount / maxValue) * 20);
      const reimbursementBarLength = Math.floor((reimbursementAmount / maxValue) * 20);

      const expenseBar = '█'.repeat(expenseBarLength) + '░'.repeat(20 - expenseBarLength);
      const reimbursementBar = '█'.repeat(reimbursementBarLength) + '░'.repeat(20 - reimbursementBarLength);

      console.log(`${year} Expenses       ╢${expenseBar} $${expenseAmount.toFixed(2)}`);
      console.log(`${year} Reimbursements ╢${reimbursementBar} $${reimbursementAmount.toFixed(2)}`);
    }

    console.log('                    ╚════════════════════');
    console.log();
  }

  // Summary statistics
  console.log('📊 Summary Statistics');
  console.log('━'.repeat(50));

  const stats = calculateSummaryStats(years, expensesByYear, reimbursementsByYear, receiptCounts, invalidFiles);

  console.log(`${colorize('Total Receipts Processed:', 'cyan')} ${stats.totalFiles}`);
  if (stats.totalInvalidFiles > 0) {
    console.log(
      `${colorize('Invalid Receipts:', 'yellow')} ${stats.totalInvalidFiles} (${stats.invalidFilePercentage}%)`
    );
  }
  console.log(`${colorize('Years Covered:', 'cyan')} ${years.length} (${years[0]} - ${years[years.length - 1]})`);
  console.log(`${colorize('Total Expenses:', 'cyan')} $${stats.totalExpenses.toFixed(2)}`);
  console.log(
    `${colorize('Total Reimbursements:', 'cyan')} $${stats.totalReimbursements.toFixed(2)} (${stats.reimbursementRate}%)`
  );
  console.log(
    `${colorize('Total Reimburseable:', 'green')} $${stats.totalReimburseable.toFixed(2)} (${stats.reimburseableRate}%)`
  );
  console.log(`${colorize('Average Expenses/Year:', 'cyan')} $${stats.avgExpensePerYear}`);
  console.log(`${colorize('Average Receipts/Year:', 'cyan')} ${stats.avgReceiptsPerYear}`);

  if (stats.mostExpensiveYear) {
    console.log(
      `${colorize('Most Expensive Year:', 'cyan')} ${stats.mostExpensiveYear} ($${stats.mostExpensiveYearAmount.toFixed(2)} [${stats.expensePercentage}%], ${stats.mostExpensiveYearReceipts} receipts [${stats.receiptPercentage}%])`
    );
  }
}

// Export functions for testing
export { parseFileName, getTotalsByYear, colorize, calculateSummaryStats, buildYearlyResultObject, prepareChartData };

// Only run CLI when executed directly (not when imported as a module)
// Check if this file is being run directly by comparing resolved paths
const isMainModule = () => {
  try {
    // Resolve both paths to handle symlinks (from npm link)
    const scriptPath = fs.realpathSync(process.argv[1]);
    const modulePath = fs.realpathSync(__filename);
    return scriptPath === modulePath;
  } catch {
    // Fallback check: handle npx temp files and direct execution
    // Matches 'main.js' or 'main.<random-id>.js' (npx creates temp files with random IDs)
    const MAIN_FILENAME_PATTERN = /main(\.[a-zA-Z0-9_-]+)?\.js$/;
    return process.argv[1] && MAIN_FILENAME_PATTERN.test(fs.realpathSync(process.argv[1]));
  }
};

if (isMainModule()) {
  main();
}
