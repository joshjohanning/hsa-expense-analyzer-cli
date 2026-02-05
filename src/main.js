#!/usr/bin/env node

import fs, { readFileSync } from 'fs';
import prettyjson from 'prettyjson';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chartscii from 'chartscii';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import { CopilotClient, defineTool } from '@github/copilot-sdk';
import { z } from 'zod';

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

  /* istanbul ignore if -- regex already validates format, this is defensive */
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
  const expensesByCategory = {}; // { year: { category: { expenses: number, reimbursements: number, count: number } } }
  const validReceipts = []; // Store individual receipt details for Copilot context

  let fileNames;
  try {
    fileNames = fs.readdirSync(directory);
  } catch (error) {
    // Throw error for testability - caller (main function) will handle console output and exit
    throw new Error(`Cannot access directory: ${error.message}`);
  }

  for (const fileName of fileNames) {
    /* istanbul ignore if -- skip hidden files like .DS_Store */
    if (fileName.startsWith('.')) {
      continue;
    }

    const { year, description, amount, isReimbursement, isValid, error } = parseFileName(fileName);

    if (!isValid) {
      invalidFiles.push({ fileName, error });
      continue;
    }

    // Extract just the first word as the category name
    const category = (description.trim().split(' ')[0] || 'uncategorized').toLowerCase();

    if (amount > 0) {
      // Store receipt details
      validReceipts.push({
        date: fileName.split(' - ')[0],
        year,
        description,
        amount,
        isReimbursed: isReimbursement,
        category
      });

      // Initialize year data if not exists
      if (!expensesByYear[year]) {
        expensesByYear[year] = 0;
        reimbursementsByYear[year] = 0;
        receiptCounts[year] = 0;
        expensesByCategory[year] = {};
      }

      // Initialize category data if not exists for this year
      if (!expensesByCategory[year][category]) {
        expensesByCategory[year][category] = { expenses: 0, reimbursements: 0, count: 0 };
      }

      // Always count as an expense regardless of reimbursement status
      expensesByYear[year] = +(expensesByYear[year] + amount).toFixed(2);
      expensesByCategory[year][category].expenses = +(expensesByCategory[year][category].expenses + amount).toFixed(2);
      expensesByCategory[year][category].count++;

      // Additionally track as reimbursement if applicable
      if (isReimbursement) {
        reimbursementsByYear[year] = +(reimbursementsByYear[year] + amount).toFixed(2);
        expensesByCategory[year][category].reimbursements = +(
          expensesByCategory[year][category].reimbursements + amount
        ).toFixed(2);
      }

      receiptCounts[year]++;
    }
  }

  return { expensesByYear, reimbursementsByYear, receiptCounts, invalidFiles, expensesByCategory, validReceipts };
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

function buildYearlyResultObject(years, expensesByYear, reimbursementsByYear, receiptCounts, expensesByCategory = {}) {
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

    // Add category breakdown if available
    if (expensesByCategory[year]) {
      const byCategory = {};
      // Sort by expenses descending
      const sortedCategories = Object.entries(expensesByCategory[year]).sort((a, b) => b[1].expenses - a[1].expenses);

      for (const [category, data] of sortedCategories) {
        byCategory[category] = {
          expenses: `$${data.expenses.toFixed(2)}`,
          reimbursements: `$${data.reimbursements.toFixed(2)}`,
          receipts: data.count
        };
      }
      result[year].byCategory = byCategory;
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

// Helper to format a single receipt for display
function formatReceipt(receipt, includeReimbursedStatus = true) {
  const base = `${receipt.date} | ${receipt.description} | $${receipt.amount.toFixed(2)}`;
  if (!includeReimbursedStatus) return base;
  return `${base} | ${receipt.isReimbursed ? 'reimbursed' : 'not reimbursed'}`;
}

// Helper to format a list of receipts
function formatReceiptList(receipts, includeReimbursedStatus = true) {
  return receipts.map(r => formatReceipt(r, includeReimbursedStatus)).join('\n');
}

// Build high-level expense context for Copilot (tools provide detailed data on-demand)
function buildExpenseContext(years, stats) {
  return `
## HSA Expense Data Summary

- **Total Receipts:** ${stats.totalFiles}
- **Years Covered:** ${years.length} (${years[0]} - ${years[years.length - 1]})
- **Total Expenses:** $${stats.totalExpenses.toFixed(2)}
- **Total Reimbursements:** $${stats.totalReimbursements.toFixed(2)} (${stats.reimbursementRate}%)
- **Total Unreimbursed:** $${stats.totalReimburseable.toFixed(2)} (${stats.reimburseableRate}%)
- **Most Expensive Year:** ${stats.mostExpensiveYear} ($${stats.mostExpensiveYearAmount.toFixed(2)})

Use the available tools to query detailed expense data as needed.`;
}

// Create expense query tools for Copilot
function createExpenseTools(validReceipts, expensesByYear, reimbursementsByYear, expensesByCategory) {
  return [
    defineTool('search_receipts', {
      description:
        'Search receipts by keyword in description. Use this to find specific expenses like dental, doctor, pharmacy, or by person name.',
      parameters: z.object({
        keyword: z.string().describe('Keyword to search for in receipt descriptions (case-insensitive)')
      }),
      handler: ({ keyword }) => {
        const results = validReceipts.filter(r => r.description.toLowerCase().includes(keyword.toLowerCase()));
        if (results.length === 0) {
          return `No receipts found matching "${keyword}".`;
        }
        return formatReceiptList(results);
      }
    }),

    defineTool('get_largest_expenses', {
      description: 'Get the largest expenses, optionally filtered by year.',
      parameters: z.object({
        count: z.number().optional().describe('Number of expenses to return (default: 10)'),
        year: z.string().optional().describe('Filter by year (e.g., "2023")')
      }),
      handler: ({ count = 10, year }) => {
        let receipts = [...validReceipts];
        if (year) {
          receipts = receipts.filter(r => r.year === year);
        }
        const sorted = receipts.sort((a, b) => b.amount - a.amount).slice(0, count);
        if (sorted.length === 0) {
          return year ? `No receipts found for year ${year}.` : 'No receipts found.';
        }
        return formatReceiptList(sorted);
      }
    }),

    defineTool('get_unreimbursed_expenses', {
      description: 'Get all unreimbursed expenses that can still be reimbursed tax-free.',
      parameters: z.object({
        year: z.string().optional().describe('Filter by year (e.g., "2023")'),
        minAmount: z.number().optional().describe('Minimum expense amount to include')
      }),
      handler: ({ year, minAmount = 0 }) => {
        let receipts = validReceipts.filter(r => !r.isReimbursed && r.amount >= minAmount);
        if (year) {
          receipts = receipts.filter(r => r.year === year);
        }
        const sorted = receipts.sort((a, b) => b.amount - a.amount);
        if (sorted.length === 0) {
          return 'No unreimbursed expenses found matching criteria.';
        }
        const total = sorted.reduce((sum, r) => sum + r.amount, 0);
        return `${formatReceiptList(sorted, false)}\n\nTotal unreimbursed: $${total.toFixed(2)} (${sorted.length} receipts)`;
      }
    }),

    defineTool('get_expenses_by_year', {
      description: 'Get expense breakdown for a specific year including categories.',
      parameters: z.object({
        year: z.string().describe('Year to get expenses for (e.g., "2023")')
      }),
      handler: ({ year }) => {
        const expenses = expensesByYear[year];
        const reimbursements = reimbursementsByYear[year] || 0;
        const categories = expensesByCategory[year];

        if (!expenses) {
          return `No expense data found for year ${year}.`;
        }

        let result = `## ${year} Expenses\n`;
        result += `- Total Expenses: $${expenses.toFixed(2)}\n`;
        result += `- Reimbursed: $${reimbursements.toFixed(2)}\n`;
        result += `- Unreimbursed: $${(expenses - reimbursements).toFixed(2)}\n`;

        if (categories) {
          result += `\n### By Category:\n`;
          const sortedCats = Object.entries(categories).sort((a, b) => b[1].expenses - a[1].expenses);
          for (const [cat, data] of sortedCats) {
            result += `- ${cat}: $${data.expenses.toFixed(2)} (${data.count} receipts, $${data.reimbursements.toFixed(2)} reimbursed)\n`;
          }
        }
        return result;
      }
    }),

    defineTool('get_receipts_by_category', {
      description: 'Get all receipts for a specific category (e.g., person name like josh, jane).',
      parameters: z.object({
        category: z
          .string()
          .describe('Category name (typically the first word of description, e.g., "josh", "jane", "household")'),
        year: z.string().optional().describe('Filter by year')
      }),
      handler: ({ category, year }) => {
        let receipts = validReceipts.filter(r => r.category.toLowerCase() === category.toLowerCase());
        if (year) {
          receipts = receipts.filter(r => r.year === year);
        }
        if (receipts.length === 0) {
          return `No receipts found for category "${category}"${year ? ` in ${year}` : ''}.`;
        }
        const sorted = receipts.sort((a, b) => b.amount - a.amount);
        const total = sorted.reduce((sum, r) => sum + r.amount, 0);
        return `${formatReceiptList(sorted)}\n\nTotal for ${category}: $${total.toFixed(2)} (${sorted.length} receipts)`;
      }
    }),

    defineTool('list_categories', {
      description: 'List all expense categories with totals.',
      parameters: z.object({}),
      handler: () => {
        const categoryTotals = {};
        for (const receipt of validReceipts) {
          if (!categoryTotals[receipt.category]) {
            categoryTotals[receipt.category] = { expenses: 0, count: 0 };
          }
          categoryTotals[receipt.category].expenses += receipt.amount;
          categoryTotals[receipt.category].count++;
        }
        const sorted = Object.entries(categoryTotals).sort((a, b) => b[1].expenses - a[1].expenses);
        return sorted.map(([cat, data]) => `${cat}: $${data.expenses.toFixed(2)} (${data.count} receipts)`).join('\n');
      }
    })
  ];
}

// Analysis templates for Copilot
const ANALYSIS_TEMPLATES = [
  {
    name: 'Find largest expenses',
    description: 'Identify your biggest medical expenses and spending patterns',
    prompt:
      'Analyze my expense data and identify the largest expenses. Which categories or years had the biggest costs? Are there any patterns or outliers I should be aware of?'
  },
  {
    name: 'Reimbursement strategy',
    description: 'Get advice on when and how to reimburse yourself',
    prompt:
      'Based on my unreimbursed expenses, what reimbursement strategy would you recommend? Should I reimburse now or let my HSA grow? Consider tax implications and investment potential.'
  },
  {
    name: 'Year-over-year trends',
    description: 'Understand how your healthcare spending has changed',
    prompt:
      'Analyze my year-over-year spending trends. Are my healthcare costs increasing or decreasing? What might be driving these changes?'
  },
  {
    name: 'HSA optimization tips',
    description: 'Get personalized tips to maximize your HSA benefits',
    prompt:
      'Based on my expense history, what are some ways I could optimize my HSA usage? Consider contribution strategies, investment options, and tax benefits.'
  },
  {
    name: 'Ask your own question',
    description: 'Type a custom question about your expenses',
    prompt: null // Will prompt user for input
  }
];

/* istanbul ignore next -- interactive CLI function requiring user input and Copilot SDK */
async function startCopilotAnalysis(expenseContext, tools) {
  console.log(colorize('\n🤖 Copilot Analysis (Experimental)', 'cyan'));
  console.log(colorize('Requires GitHub Copilot CLI installed and authenticated.', 'dim'));
  console.log(colorize('https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli\n', 'dim'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = prompt => new Promise(resolve => rl.question(prompt, resolve));

  let client = null;
  let session = null;

  try {
    // Initialize Copilot client once for the session
    client = new CopilotClient({ logLevel: 'error' });
    await client.start();

    // Generate tool list dynamically from the tools array
    const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

    session = await client.createSession({
      model: 'gpt-4.1',
      streaming: true,
      tools,
      systemMessage: {
        content: `You are a helpful HSA (Health Savings Account) expense advisor with access to tools that query the user's expense data.

${expenseContext}

Available tools:
${toolList}

Guidelines:
- USE THE TOOLS to answer questions about specific receipts or detailed data
- Be helpful and conversational
- When discussing money, always use dollar amounts
- If asked about tax advice, remind them to consult a tax professional
- Unreimbursed HSA expenses can be reimbursed tax-free anytime in the future
- Keep responses concise but informative`
      }
    });

    // Track the current message promise resolver
    let currentResolve = null;

    // Register event handler ONCE
    session.on(event => {
      if (event.type === 'assistant.message_delta') {
        process.stdout.write(event.data.deltaContent || '');
      } else if (event.type === 'session.idle') {
        console.log('\n');
        if (currentResolve) {
          currentResolve();
          currentResolve = null;
        }
      }
    });

    // Main menu loop
    while (true) {
      console.log(colorize('What would you like to analyze?', 'cyan'));
      console.log();

      for (const [index, template] of ANALYSIS_TEMPLATES.entries()) {
        console.log(`  ${colorize(`${index + 1}.`, 'green')} ${template.name}`);
        console.log(`     ${colorize(template.description, 'dim')}`);
      }
      console.log(`  ${colorize('0.', 'yellow')} Exit`);
      console.log();

      const choice = await question(colorize('Enter choice (0-5): ', 'green'));
      const choiceNum = parseInt(choice.trim(), 10);

      if (choiceNum === 0 || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'quit') {
        console.log(colorize('\n👋 Goodbye! Happy saving!\n', 'cyan'));
        break;
      }

      if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > ANALYSIS_TEMPLATES.length) {
        console.log(colorize('\n❌ Invalid choice. Please enter a number 0-5.\n', 'red'));
        continue;
      }

      const template = ANALYSIS_TEMPLATES[choiceNum - 1];
      const prompt = template.prompt;

      // Handle custom question - enter chat mode for follow-ups
      if (prompt === null) {
        console.log(colorize('\n💬 Chat mode - ask questions, type "back" to return to menu\n', 'dim'));

        while (true) {
          const customQuestion = await question(colorize('You: ', 'green'));
          const trimmed = customQuestion.trim().toLowerCase();

          if (!customQuestion.trim()) {
            continue;
          }
          if (trimmed === 'back' || trimmed === 'menu' || trimmed === 'done') {
            console.log();
            break;
          }

          console.log();
          process.stdout.write(colorize('Copilot: ', 'cyan'));

          try {
            const done = new Promise(resolve => {
              currentResolve = resolve;
            });

            await session.send({ prompt: customQuestion.trim() });
            await done;
          } catch (err) {
            console.log(colorize(`\nError: ${err.message}`, 'red'));
          }
        }
        continue; // Skip the prompt sending below, go back to menu
      }

      console.log();
      process.stdout.write(colorize('Copilot: ', 'cyan'));

      try {
        const done = new Promise(resolve => {
          currentResolve = resolve;
        });

        await session.send({ prompt });
        await done;
      } catch (err) {
        console.log(colorize(`\nError: ${err.message}`, 'red'));
      }
    }

    rl.close();
    await session.destroy();
    await client.stop();
  } catch (error) {
    console.error(colorize(`\n❌ Failed to start Copilot: ${error.message}`, 'red'));
    console.error(colorize('Make sure you have the Copilot CLI installed and are authenticated.', 'dim'));
    console.error(colorize('Visit: https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli', 'dim'));
    rl.close();
    try {
      if (session) await session.destroy();
    } catch {
      // Ignore cleanup errors
    }
    try {
      if (client) await client.stop();
    } catch {
      // Ignore cleanup errors
    }
    process.exit(1);
  }
}

// Main CLI execution
async function main() {
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
    .option('by-category', {
      type: 'boolean',
      default: false,
      describe: 'Show expenses grouped by category (e.g., person)'
    })
    .option('analyze', {
      type: 'boolean',
      default: false,
      describe: '🤖 Experimental: Analyze expenses with Copilot AI (requires Copilot CLI)'
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
  let expensesByCategory;
  let validReceipts;
  try {
    ({ expensesByYear, reimbursementsByYear, receiptCounts, invalidFiles, expensesByCategory, validReceipts } =
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
    argv['by-category'] ? expensesByCategory : {}
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

  // Handle Copilot analysis (experimental)
  if (argv.analyze) {
    const expenseContext = buildExpenseContext(years, stats);
    const tools = createExpenseTools(validReceipts, expensesByYear, reimbursementsByYear, expensesByCategory);

    await startCopilotAnalysis(expenseContext, tools);
  }
}

// Export functions for testing
export {
  parseFileName,
  getTotalsByYear,
  colorize,
  calculateSummaryStats,
  buildYearlyResultObject,
  prepareChartData,
  formatReceipt,
  formatReceiptList,
  buildExpenseContext,
  createExpenseTools,
  ANALYSIS_TEMPLATES
};

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

/* istanbul ignore next -- CLI entry point */
if (isMainModule()) {
  main();
}
