/**
 * Risk questionnaire. Scoring structure follows the FNCE 2830 Investor Risk Questionnaire (CU Boulder) exactly:
 *   risk tolerance = Q1-Q6 (range 6-28): 6-9 Conservative, 10-16 Moderate, 17-23 Assertive, 24-28 Aggressive
 *   time horizon   = Q7-Q10 (range 4-20): 4-7 Short-term, 8-13 Intermediate, 14+ Long-term
 * Point values and question/option text are the originals from Flight Plan (see provenance note below).
 */

export const TEXT_VERIFIED = true;
export const QUESTIONNAIRE_SOURCE =
  'Educational questionnaire adapted from FNCE 2830 (CU Boulder), which cites the Securities Industry Association Risk Tolerance Quiz and the ProQuest Risk Tolerance Questionnaire. Professional risk assessments are longer and more involved.';
/**
 * Provenance: question and option text copied verbatim from Flight Plan's bundled questionnaire (flight-plan.html,
 * provided by the owner 2026-11-03). Two pilot-specific phrases were generalized for Base Case:
 *  - Q8 example "pay off flight-school loans" -> "pay off student loans"
 *  - Q10 help "include disability and loss-of-license (medical certificate) coverage" -> "include disability coverage"
 * Point values, option order and the Q5 ranges are unchanged.
 */
export const TEXT_ADAPTATIONS = ['Q8: "flight-school loans" -> "student loans"', 'Q10 help: loss-of-license coverage removed'];

export interface QuestionOption {
  label: string;
  points: number;
}

export interface Question {
  id: string;
  /** 'risk' for Q1-Q6, 'horizon' for Q7-Q10 */
  section: 'risk' | 'horizon';
  /** Short label used in summaries */
  short?: string;
  /** May contain {{amount}} which the UI substitutes with the formatted portfolio amount */
  text: string;
  options: QuestionOption[];
  /** Q5 only: outcome ranges as multiples of the portfolio amount [high, median, base, low] */
  ranges?: number[][];
  help?: string;
}

export const QUESTIONS: Question[] = [
  {
    id: 'q1', section: 'risk', short: 'Objective',
    text: 'What is the primary objective or goal for your {{amount}} investment portfolio?',
    options: [
      { label: 'Safety — conservation of capital', points: 1 },
      { label: 'Income + Safety — current income + conserve capital', points: 2 },
      { label: 'Balance of Growth and Income', points: 3 },
      { label: 'Portfolio Growth', points: 4 },
      { label: 'High Capital Appreciation', points: 5 },
    ],
  },
  {
    id: 'q2', section: 'risk', short: 'Risk to double',
    text: 'What percentage of your {{amount}} portfolio would you risk in order to double your investment amount?',
    options: [
      { label: '0%', points: 1 },
      { label: '10%', points: 2 },
      { label: '25%', points: 3 },
      { label: '50%', points: 4 },
    ],
  },
  {
    id: 'q3', section: 'risk', short: 'Experience',
    text: 'What is your investment experience, and how comfortable are you with investing?',
    options: [
      { label: 'None and not very', points: 1 },
      { label: 'Some investment experience but somewhat uneasy', points: 2 },
      { label: 'Little investment experience but anxious to start', points: 3 },
      { label: 'Adequate or extensive experience and comfortable', points: 4 },
    ],
  },
  {
    id: 'q4', section: 'risk', short: 'Riskiest asset',
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
    id: 'q5', section: 'risk', short: 'Volatility range',
    text: 'Market volatility causes portfolio values to fluctuate during any given year. Which of these one-year ranges would you prefer?',
    options: [
      { label: 'Range #1', points: 1 },
      { label: 'Range #2', points: 2 },
      { label: 'Range #3', points: 3 },
      { label: 'Range #4', points: 4 },
      { label: 'Range #5', points: 5 },
    ],
    ranges: [
      [1.1, 1.03, 1.0, 0.95],
      [1.15, 1.08, 1.0, 0.92],
      [1.2, 1.1, 1.0, 0.9],
      [1.3, 1.15, 1.0, 0.85],
      [1.5, 1.2, 1.0, 0.75],
    ],
    help: 'Each bar shows the high, median and low value of {{amount}} after one year.',
  },
  {
    id: 'q6', section: 'risk', short: 'Additions',
    text: 'How much and how often do you expect to add to this investment lump sum over your investment horizon?',
    options: [
      { label: "This will be the entire investment; I don't expect to add to it", points: 1 },
      { label: "I expect to add less than 10%, and I don't expect to maintain a consistent investment program", points: 2 },
      { label: 'I expect to add less than 25% but I plan on starting a systematic annual investment contribution', points: 3 },
      { label: 'I expect to start by adding greater than 10%, and I expect that my contributions will grow in size over the years', points: 4 },
    ],
  },
  {
    id: 'q7', section: 'horizon', short: 'Holding period',
    text: 'How long do you expect to allow this capital to invest before drawing down funds, and how important is liquidity?',
    options: [
      { label: 'Less than 1 year; liquidity very important', points: 1 },
      { label: '1–3 years; somewhat important', points: 2 },
      { label: '3–7 years; less important', points: 4 },
      { label: 'More than 7 years; not a concern', points: 6 },
    ],
  },
  {
    id: 'q8', section: 'horizon', short: 'Next expenditure',
    text: "When do you expect your next major expenditure (e.g., pay off student loans, buy a home, fund a child's education), and how will you pay for it?",
    options: [
      { label: 'Within the next year or two, paid from portfolio holdings', points: 1 },
      { label: 'Possibly within three years, part from funds outside the portfolio', points: 2 },
      { label: 'Within five to seven years, large part from assets outside the portfolio', points: 3 },
      { label: 'No major expenditure planned, and it would not be funded from this portfolio', points: 5 },
    ],
  },
  {
    id: 'q9', section: 'horizon', short: 'Years to retire',
    text: 'How long do you have before you anticipate retiring?',
    options: [
      { label: 'Less than 5 years', points: 1 },
      { label: 'Less than 10 years', points: 2 },
      { label: 'More than 10 years', points: 3 },
      { label: 'More than 30 years', points: 5 },
    ],
  },
  {
    id: 'q10', section: 'horizon', short: 'Insurance',
    text: 'Insurance provides coverage for unforeseen financial occurrences. How much insurance do you have?',
    help: 'Include disability coverage.',
    options: [
      { label: 'None or very little', points: 1 },
      { label: 'Some', points: 2 },
      { label: 'Considerable', points: 3 },
      { label: 'Complete', points: 4 },
    ],
  },
];

export const RISK_BANDS: { max: number; category: 'Conservative' | 'Moderate' | 'Assertive' | 'Aggressive' }[] = [
  { max: 9, category: 'Conservative' },
  { max: 16, category: 'Moderate' },
  { max: 23, category: 'Assertive' },
  { max: 28, category: 'Aggressive' },
];

export const HORIZON_BANDS: { max: number; category: 'Short-term' | 'Intermediate' | 'Long-term' }[] = [
  { max: 7, category: 'Short-term' },
  { max: 13, category: 'Intermediate' },
  { max: 20, category: 'Long-term' },
];

/** Supplement: NOT part of the class score. Feeds the emergency-fund target and alerts. */
export interface SupplementQuestion {
  id: string;
  text: string;
  options: { label: string; value: number }[];
}

export const SUPPLEMENT: SupplementQuestion[] = [
  {
    id: 's1',
    text: 'How stable is your industry and employer (layoff risk)?',
    options: [
      { label: 'Very stable (public sector, healthcare, utilities)', value: 0 },
      { label: 'Somewhat stable', value: 1 },
      { label: 'Volatile: layoffs or restructurings are common', value: 2 },
    ],
  },
  {
    id: 's2',
    text: 'How much of your pay depends on bonuses or commissions?',
    options: [
      { label: 'None', value: 0 },
      { label: 'Less than 20%', value: 1 },
      { label: '20% or more', value: 2 },
    ],
  },
  {
    id: 's3',
    text: 'Do you have long-term disability coverage through work?',
    options: [
      { label: 'Yes', value: 1 },
      { label: 'No', value: 0 },
      { label: 'Not sure', value: 2 },
    ],
  },
  {
    id: 's4',
    text: 'Is there a second income in your household?',
    options: [
      { label: 'Yes', value: 1 },
      { label: 'No', value: 0 },
    ],
  },
];
