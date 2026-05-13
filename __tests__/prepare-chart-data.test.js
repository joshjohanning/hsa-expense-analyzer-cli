import { prepareChartData } from '../src/main.js';

describe('prepareChartData', () => {
  test('should prepare stacked chart data for multiple years', () => {
    const years = ['2021', '2022', '2023'];
    const expensesByYear = { 2021: 100.0, 2022: 250.0, 2023: 150.0 };
    const reimbursementsByYear = { 2021: 50.0, 2022: 100.0, 2023: 75.0 };

    const { stackedData } = prepareChartData(years, expensesByYear, reimbursementsByYear);

    expect(stackedData).toEqual([
      { label: '2021', value: [50.0, 50.0] },
      { label: '2022', value: [100.0, 150.0] },
      { label: '2023', value: [75.0, 75.0] }
    ]);
  });

  test('should handle empty years array', () => {
    const years = [];
    const expensesByYear = {};
    const reimbursementsByYear = {};

    const { stackedData } = prepareChartData(years, expensesByYear, reimbursementsByYear);

    expect(stackedData).toEqual([]);
  });

  test('should handle single year', () => {
    const years = ['2024'];
    const expensesByYear = { 2024: 500.0 };
    const reimbursementsByYear = { 2024: 0 };

    const { stackedData } = prepareChartData(years, expensesByYear, reimbursementsByYear);

    expect(stackedData).toEqual([{ label: '2024', value: [0, 500.0] }]);
  });

  test('should default to 0 when year not in expense/reimbursement objects', () => {
    const years = ['2020', '2021'];
    const expensesByYear = { 2021: 100.0 }; // Missing 2020
    const reimbursementsByYear = {}; // Missing both

    const { stackedData } = prepareChartData(years, expensesByYear, reimbursementsByYear);

    expect(stackedData).toEqual([
      { label: '2020', value: [0, 0] },
      { label: '2021', value: [0, 100.0] }
    ]);
  });
});
