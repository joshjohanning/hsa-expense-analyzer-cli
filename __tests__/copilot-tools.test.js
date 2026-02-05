import { buildExpenseContext, createExpenseTools, ANALYSIS_TEMPLATES } from '../src/main.js';

describe('buildExpenseContext', () => {
  it('should format expense context with stats', () => {
    const years = ['2021', '2022', '2023'];
    const stats = {
      totalFiles: 25,
      totalExpenses: 5000.5,
      totalReimbursements: 2000.25,
      totalReimburseable: 3000.25,
      reimbursementRate: '40.00',
      reimburseableRate: '60.00',
      mostExpensiveYear: '2022',
      mostExpensiveYearAmount: 2500.0
    };

    const result = buildExpenseContext(years, stats);

    expect(result).toContain('Total Receipts:** 25');
    expect(result).toContain('Years Covered:** 3 (2021 - 2023)');
    expect(result).toContain('Total Expenses:** $5000.50');
    expect(result).toContain('Total Reimbursements:** $2000.25 (40.00%)');
    expect(result).toContain('Total Unreimbursed:** $3000.25 (60.00%)');
    expect(result).toContain('Most Expensive Year:** 2022 ($2500.00)');
    expect(result).toContain('Use the available tools to query detailed expense data');
  });

  it('should handle single year', () => {
    const years = ['2023'];
    const stats = {
      totalFiles: 5,
      totalExpenses: 1000.0,
      totalReimbursements: 500.0,
      totalReimburseable: 500.0,
      reimbursementRate: '50.00',
      reimburseableRate: '50.00',
      mostExpensiveYear: '2023',
      mostExpensiveYearAmount: 1000.0
    };

    const result = buildExpenseContext(years, stats);

    expect(result).toContain('Years Covered:** 1 (2023 - 2023)');
  });
});

describe('ANALYSIS_TEMPLATES', () => {
  it('should have 5 templates', () => {
    expect(ANALYSIS_TEMPLATES).toHaveLength(5);
  });

  it('should have required properties for each template', () => {
    for (const template of ANALYSIS_TEMPLATES) {
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('prompt');
      expect(typeof template.name).toBe('string');
      expect(typeof template.description).toBe('string');
    }
  });

  it('should have chat mode as last option with null prompt', () => {
    const lastTemplate = ANALYSIS_TEMPLATES[ANALYSIS_TEMPLATES.length - 1];
    expect(lastTemplate.prompt).toBeNull();
    expect(lastTemplate.name.toLowerCase()).toContain('question');
  });
});

describe('createExpenseTools', () => {
  const mockReceipts = [
    {
      year: '2023',
      date: '2023-05-15',
      description: 'dental cleaning josh',
      amount: 150.0,
      isReimbursed: true,
      reimbursedDate: '2023-06-01',
      category: 'dental'
    },
    {
      year: '2023',
      date: '2023-08-20',
      description: 'doctor visit jane',
      amount: 200.0,
      isReimbursed: false,
      reimbursedDate: null,
      category: 'medical'
    },
    {
      year: '2022',
      date: '2022-03-10',
      description: 'pharmacy prescription',
      amount: 50.0,
      isReimbursed: false,
      reimbursedDate: null,
      category: 'pharmacy'
    },
    {
      year: '2022',
      date: '2022-11-05',
      description: 'dental filling josh',
      amount: 300.0,
      isReimbursed: true,
      reimbursedDate: '2022-12-01',
      category: 'dental'
    }
  ];

  const expensesByYear = {
    2022: 350.0,
    2023: 350.0
  };

  const reimbursementsByYear = {
    2022: 300.0,
    2023: 150.0
  };

  // expensesByCategory is keyed by year, then by category
  const expensesByCategory = {
    2022: {
      dental: { expenses: 300.0, reimbursements: 300.0, count: 1 },
      pharmacy: { expenses: 50.0, reimbursements: 0, count: 1 }
    },
    2023: {
      dental: { expenses: 150.0, reimbursements: 150.0, count: 1 },
      medical: { expenses: 200.0, reimbursements: 0, count: 1 }
    }
  };

  let tools;

  beforeEach(() => {
    tools = createExpenseTools(mockReceipts, expensesByYear, reimbursementsByYear, expensesByCategory);
  });

  it('should create 6 tools', () => {
    expect(tools).toHaveLength(6);
  });

  describe('search_receipts tool', () => {
    it('should find receipts by keyword', () => {
      const tool = tools.find(t => t.name === 'search_receipts');
      const result = tool.handler({ keyword: 'dental' });

      expect(result).toContain('dental cleaning josh');
      expect(result).toContain('dental filling josh');
      expect(result).toContain('$150.00');
      expect(result).toContain('$300.00');
    });

    it('should return message when no results found', () => {
      const tool = tools.find(t => t.name === 'search_receipts');
      const result = tool.handler({ keyword: 'nonexistent' });

      expect(result).toBe('No receipts found matching "nonexistent".');
    });

    it('should be case-insensitive', () => {
      const tool = tools.find(t => t.name === 'search_receipts');
      const result = tool.handler({ keyword: 'DENTAL' });

      expect(result).toContain('dental cleaning');
    });
  });

  describe('get_largest_expenses tool', () => {
    it('should return largest expenses sorted by amount', () => {
      const tool = tools.find(t => t.name === 'get_largest_expenses');
      const result = tool.handler({ count: 2 });

      expect(result).toContain('dental filling josh');
      expect(result).toContain('$300.00');
      // First result should be $300, second should be $200
      const lines = result.split('\n');
      expect(lines[0]).toContain('300.00');
    });

    it('should filter by year', () => {
      const tool = tools.find(t => t.name === 'get_largest_expenses');
      const result = tool.handler({ year: '2023' });

      expect(result).toContain('doctor visit jane');
      expect(result).toContain('dental cleaning josh');
      expect(result).not.toContain('pharmacy');
      expect(result).not.toContain('dental filling');
    });

    it('should return message when no receipts for year', () => {
      const tool = tools.find(t => t.name === 'get_largest_expenses');
      const result = tool.handler({ year: '2020' });

      expect(result).toBe('No receipts found for year 2020.');
    });
  });

  describe('get_unreimbursed_expenses tool', () => {
    it('should return only unreimbursed expenses', () => {
      const tool = tools.find(t => t.name === 'get_unreimbursed_expenses');
      const result = tool.handler({});

      expect(result).toContain('doctor visit jane');
      expect(result).toContain('pharmacy prescription');
      expect(result).not.toContain('dental cleaning josh');
      expect(result).not.toContain('dental filling josh');
    });

    it('should filter unreimbursed by year', () => {
      const tool = tools.find(t => t.name === 'get_unreimbursed_expenses');
      const result = tool.handler({ year: '2023' });

      expect(result).toContain('doctor visit jane');
      expect(result).not.toContain('pharmacy');
    });

    it('should include total unreimbursed amount', () => {
      const tool = tools.find(t => t.name === 'get_unreimbursed_expenses');
      const result = tool.handler({});

      expect(result).toContain('Total unreimbursed:');
      expect(result).toContain('$250.00');
    });

    it('should filter by minAmount', () => {
      const tool = tools.find(t => t.name === 'get_unreimbursed_expenses');
      const result = tool.handler({ minAmount: 100 });

      expect(result).toContain('doctor visit jane');
      expect(result).not.toContain('pharmacy'); // $50 is below minAmount
    });

    it('should return message when no unreimbursed expenses match', () => {
      const tool = tools.find(t => t.name === 'get_unreimbursed_expenses');
      const result = tool.handler({ minAmount: 1000 });

      expect(result).toBe('No unreimbursed expenses found matching criteria.');
    });
  });

  describe('get_expenses_by_year tool', () => {
    it('should return expense summary for specified year', () => {
      const tool = tools.find(t => t.name === 'get_expenses_by_year');
      const result = tool.handler({ year: '2023' });

      expect(result).toContain('2023 Expenses');
      expect(result).toContain('Total Expenses: $350.00');
      expect(result).toContain('Reimbursed: $150.00');
      expect(result).toContain('Unreimbursed: $200.00');
    });

    it('should include year summary', () => {
      const tool = tools.find(t => t.name === 'get_expenses_by_year');
      const result = tool.handler({ year: '2022' });

      expect(result).toContain('2022 Expenses');
      expect(result).toContain('Total Expenses: $350.00');
      expect(result).toContain('Reimbursed: $300.00');
    });

    it('should return message for year with no data', () => {
      const tool = tools.find(t => t.name === 'get_expenses_by_year');
      const result = tool.handler({ year: '2020' });

      expect(result).toBe('No expense data found for year 2020.');
    });

    it('should include category breakdown when available', () => {
      const tool = tools.find(t => t.name === 'get_expenses_by_year');
      const result = tool.handler({ year: '2022' });

      expect(result).toContain('By Category:');
      expect(result).toContain('dental: $300.00');
      expect(result).toContain('pharmacy: $50.00');
    });
  });

  describe('get_receipts_by_category tool', () => {
    it('should return receipts for specified category', () => {
      const tool = tools.find(t => t.name === 'get_receipts_by_category');
      const result = tool.handler({ category: 'dental' });

      expect(result).toContain('dental cleaning josh');
      expect(result).toContain('dental filling josh');
      expect(result).not.toContain('doctor visit');
      expect(result).not.toContain('pharmacy');
    });

    it('should include category total', () => {
      const tool = tools.find(t => t.name === 'get_receipts_by_category');
      const result = tool.handler({ category: 'dental' });

      expect(result).toContain('Total for dental: $450.00');
    });

    it('should return message for unknown category', () => {
      const tool = tools.find(t => t.name === 'get_receipts_by_category');
      const result = tool.handler({ category: 'vision' });

      expect(result).toBe('No receipts found for category "vision".');
    });

    it('should filter category by year', () => {
      const tool = tools.find(t => t.name === 'get_receipts_by_category');
      const result = tool.handler({ category: 'dental', year: '2023' });

      expect(result).toContain('dental cleaning josh');
      expect(result).not.toContain('dental filling'); // 2022
    });

    it('should return message for category with no receipts in year', () => {
      const tool = tools.find(t => t.name === 'get_receipts_by_category');
      const result = tool.handler({ category: 'medical', year: '2022' });

      expect(result).toBe('No receipts found for category "medical" in 2022.');
    });
  });

  describe('list_categories tool', () => {
    it('should list all categories with totals', () => {
      const tool = tools.find(t => t.name === 'list_categories');
      const result = tool.handler({});

      expect(result).toContain('dental: $450.00');
      expect(result).toContain('medical: $200.00');
      expect(result).toContain('pharmacy: $50.00');
    });
  });
});
