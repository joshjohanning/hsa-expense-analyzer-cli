/**
 * Copilot integration for HSA expense analysis
 * This file is excluded from coverage as it contains interactive CLI code
 * that requires user input and the Copilot SDK.
 */

import readline from 'readline';
import { CopilotClient } from '@github/copilot-sdk';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function colorize(text, color) {
  if (process.argv.includes('--no-color')) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

// Analysis templates for the interactive menu
export const ANALYSIS_TEMPLATES = [
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

/**
 * Start an interactive Copilot analysis session
 * @param {string} expenseContext - High-level expense summary for context
 * @param {Array} tools - Copilot tools for querying expense data
 */
export async function startCopilotAnalysis(expenseContext, tools) {
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
