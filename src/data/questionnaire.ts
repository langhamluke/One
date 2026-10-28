/**
 * Investor Risk Questionnaire — reproduced exactly (questions, options, and point values)
 * from FNCE 2830 Investor Risk Questionnaire, CU Boulder.
 * `{AMT}` is replaced with the editable portfolio amount.
 */
export interface QOption { label: string; points: number }
export interface Question {
  id: string;
  n: number;
  group: 'risk' | 'horizon';
  text: string;
  short: string;
  options: QOption[];
  help?: string;
  /** Q5 only: one-year range multiples per option */
  ranges?: { high: number; median: number; base: number; low: number }[];
}

export const QUESTIONS: Question[] = [
  {
    id: 'q1', n: 1, group: 'risk', short: 'Objective',
    text: 'What is the primary objective or goal for your {AMT} investment portfolio?',
    options: [
      { label: 'Safety — conservation of capital', points: 1 },
      { label: 'Income + Safety — current income + conserve capital', points: 2 },
      { label: 'Balance of Growth and Income', points: 3 },
      { label: 'Portfolio Growth', points: 4 },
      { label: 'High Capital Appreciation', points: 5 },
    ],
  },
  {
    id: 'q2', n: 2, group: 'risk', short: 'Risk to double',
    text: 'What percentage of your {AMT} portfolio would you risk in order to double your investment amount?',
    options: [
      { label: '0%', points: 1 },
      { label: '10%', points: 2 },
      { label: '25%', points: 3 },
      { label: '50%', points: 4 },
    ],
  },
  {
    id: 'q3', n: 3, group: 'risk', short: 'Experience',
    text: 'What is your investment experience, and how comfortable are you with investing?',
    options: [
      { label: 'None and not very', points: 1 },
      { label: 'Some investment experience but somewhat uneasy', points: 2 },
      { label: 'Little investment experience but anxious to start', points: 3 },
      { label: 'Adequate or extensive experience and comfortable', points: 4 },
    ],
  },
  {
    id: 'q4', n: 4, group: 'risk', short: 'Riskiest asset',
    text: 'What is the riskiest asset class that you would consider holding in your portfolio?',
    options: [
      { label: 'Money Markets and US Treasury Bills', points: 1 },
      { label: 'Corporate and Government Bond Funds', points: 2 },
      { label: 'Bond Funds and High-Quality Stocks', points: 3 },
      { label: 'Index and Large-cap Stock Funds', points: 4 },
      { label: 'Capital Appreciation and International Stock Funds', points: 5 },
      { label: 'Alternatives and Small-cap Growth Funds', points: 6 },
    ],
  },
  {
    id: 'q5', n: 5, group: 'risk', short: 'Volatility range',
    text: 'Market volatility causes portfolio values to fluctuate during any given year. Which of these one-year ranges would you prefer?',
    options: [
      { label: 'Range #1', points: 1 },
      { label: 'Range #2', points: 2 },
      { label: 'Range #3', points: 3 },
      { label: 'Range #4', points: 4 },
      { label: 'Range #5', points: 5 },
    ],
    // #5 stated in the course handout; #1–#4 read off its chart to the nearest ~0.01.
    ranges: [
      { high: 1.10, median: 1.03, base: 1.00, low: 0.95 },
      { high: 1.15, median: 1.08, base: 1.00, low: 0.92 },
      { high: 1.20, median: 1.10, base: 1.00, low: 0.90 },
      { high: 1.30, median: 1.15, base: 1.00, low: 0.85 },
      { high: 1.50, median: 1.20, base: 1.00, low: 0.75 },
    ],
  },
  {
    id: 'q6', n: 6, group: 'risk', short: 'Additions',
    text: 'How much and how often do you expect to add to this investment lump sum over your investment horizon?',
    options: [
      { label: "This will be the entire investment; I don't expect to add to it", points: 1 },
      { label: "I expect to add less than 10%, and I don't expect to maintain a consistent investment program", points: 2 },
      { label: 'I expect to add less than 25% but I plan on starting a systematic annual investment contribution', points: 3 },
      { label: 'I expect to start by adding greater than 10%, and I expect that my contributions will grow in size over the years', points: 4 },
    ],
  },
  {
    id: 'q7', n: 7, group: 'horizon', short: 'Holding period',
    text: 'How long do you expect to allow this capital to invest before drawing down funds, and how important is liquidity?',
    options: [
      { label: 'Less than 1 year; liquidity very important', points: 1 },
      { label: '1–3 years; somewhat important', points: 2 },
      { label: '3–7 years; less important', points: 4 },
      { label: 'More than 7 years; not a concern', points: 6 },
    ],
  },
  {
    id: 'q8', n: 8, group: 'horizon', short: 'Next expenditure',
    text: "When do you expect your next major expenditure (e.g., pay off flight-school loans, buy a home, fund a child's education), and how will you pay for it?",
    options: [
      { label: 'Within the next year or two, paid from portfolio holdings', points: 1 },
      { label: 'Possibly within three years, part from funds outside the portfolio', points: 2 },
      { label: 'Within five to seven years, large part from assets outside the portfolio', points: 3 },
      { label: 'No major expenditure planned, and it would not be funded from this portfolio', points: 5 },
    ],
  },
  {
    id: 'q9', n: 9, group: 'horizon', short: 'Years to retire',
    text: 'How long do you have before you anticipate retiring?',
    options: [
      { label: 'Less than 5 years', points: 1 },
      { label: 'Less than 10 years', points: 2 },
      { label: 'More than 10 years', points: 3 },
      { label: 'More than 30 years', points: 5 },
    ],
  },
  {
    id: 'q10', n: 10, group: 'horizon', short: 'Insurance',
    text: 'Insurance provides coverage for unforeseen financial occurrences. How much insurance do you have?',
    help: 'For pilots, include disability and loss-of-license (medical certificate) coverage.',
    options: [
      { label: 'None or very little', points: 1 },
      { label: 'Some', points: 2 },
      { label: 'Considerable', points: 3 },
      { label: 'Complete', points: 4 },
    ],
  },
];

export const QUESTIONNAIRE_FOOTNOTE =
  'Educational questionnaire adapted from FNCE 2830 (CU Boulder), which cites the Securities Industry Association Risk Tolerance Quiz and the ProQuest Risk Tolerance Questionnaire. Professional risk assessments are longer and more involved.';

/** Pilot Supplement — NOT part of the class score. Feeds EICAS alerts, Career Risk, and emergency-fund target. */
export interface SupplementQ { id: 's1' | 's2' | 's3' | 's4'; text: string; options: { label: string; risk: number }[] }

export const SUPPLEMENT: SupplementQ[] = [
  {
    id: 's1',
    text: "How exposed is your income to your airline's health (furlough history, base closures, junior seniority)?",
    options: [
      { label: 'Low — senior / stable carrier', risk: 0 },
      { label: 'Moderate', risk: 1 },
      { label: 'High — junior, furlough or base-closure history', risk: 2 },
    ],
  },
  {
    id: 's2',
    text: 'Do you hold employer stock or rely on profit sharing for regular expenses?',
    options: [
      { label: 'No', risk: 0 },
      { label: 'Some (under 10% of net worth / not budgeted)', risk: 1 },
      { label: 'Heavily (10%+ of net worth or budgeted)', risk: 2 },
    ],
  },
  {
    id: 's3',
    text: 'Do you have loss-of-license (medical certificate) coverage?',
    options: [
      { label: 'Yes — adequate benefit', risk: 0 },
      { label: 'Yes — small / union minimum only', risk: 1 },
      { label: 'No', risk: 2 },
    ],
  },
  {
    id: 's4',
    text: 'Is there a second household income?',
    options: [
      { label: 'Yes — could cover core expenses', risk: 0 },
      { label: 'Yes — modest', risk: 1 },
      { label: 'No — single income', risk: 2 },
    ],
  },
];
