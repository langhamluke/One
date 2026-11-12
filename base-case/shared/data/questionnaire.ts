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

/**
 * Pilot Supplement (Flight Plan): the original four pilot questions, verbatim from the Flight Plan build.
 * Option VALUES share the Base Case meaning so the emergency-fund rule needs no branching:
 *   s1 = 2 high exposure · s2 = 2 heavy reliance on employer stock / profit sharing · s3 = 0 no coverage · s4 = 0 no second income.
 */
export const PILOT_SUPPLEMENT: SupplementQuestion[] = [
  {
    id: 's1',
    text: "How exposed is your income to your airline's health (furlough history, base closures, junior seniority)?",
    options: [
      { label: 'Low — senior / stable carrier', value: 0 },
      { label: 'Moderate', value: 1 },
      { label: 'High — junior, furlough or base-closure history', value: 2 },
    ],
  },
  {
    id: 's2',
    text: 'Do you hold employer stock or rely on profit sharing for regular expenses?',
    options: [
      { label: 'No', value: 0 },
      { label: 'Some (under 10% of net worth / not budgeted)', value: 1 },
      { label: 'Heavily (10%+ of net worth or budgeted)', value: 2 },
    ],
  },
  {
    id: 's3',
    text: 'Do you have loss-of-license (medical certificate) coverage?',
    options: [
      { label: 'Yes — adequate benefit', value: 1 },
      { label: 'Yes — small / union minimum only', value: 2 },
      { label: 'No', value: 0 },
    ],
  },
  {
    id: 's4',
    text: 'Is there a second household income?',
    options: [
      { label: 'Yes — could cover core expenses', value: 1 },
      { label: 'Yes — modest', value: 2 },
      { label: 'No — single income', value: 0 },
    ],
  },
];

/**
 * Sprout supplement: four questions that set the student emergency-fund target (the base is the $500 starter).
 * Option VALUES: s1 0 family covers it · 1 I pay some (+1 month) · 2 I pay all (+3 months); s2 0 steady · 1 varies
 * (+1 month) · 2 seasonal (+1 month); s3 0 no bill · 1 bill in my name (+$500); s4 1 someone could help · 0 not
 * really (+1 month). s4 = 0 keeps the Base Case meaning (no backup income). Rule in shared/lib/sprout.ts.
 */
export const STUDENT_SUPPLEMENT: SupplementQuestion[] = [
  {
    id: 's1',
    text: 'Who pays for your housing and food?',
    options: [
      { label: 'Family covers it all', value: 0 },
      { label: 'I pay some of it', value: 1 },
      { label: 'I pay all of it', value: 2 },
    ],
  },
  {
    id: 's2',
    text: 'How steady are your hours?',
    options: [
      { label: 'About the same every week', value: 0 },
      { label: 'They change week to week', value: 1 },
      { label: 'Summer or seasonal only', value: 2 },
    ],
  },
  {
    id: 's3',
    text: 'Is a car, phone or other bill in your name?',
    options: [
      { label: 'No', value: 0 },
      { label: 'Yes', value: 1 },
    ],
  },
  {
    id: 's4',
    text: 'If something went wrong, is there someone who could help you out?',
    options: [
      { label: 'Yes', value: 1 },
      { label: 'Not really', value: 0 },
    ],
  },
];

/** Supplement questions for a product. */
export function supplementFor(product: string | undefined | null): SupplementQuestion[] {
  if (product === 'flight-plan') return PILOT_SUPPLEMENT;
  if (product === 'sprout') return STUDENT_SUPPLEMENT;
  return SUPPLEMENT;
}

/** Flight Plan restores the two pilot-specific phrases that Base Case generalized (see TEXT_ADAPTATIONS). Scoring is identical. */
export const PILOT_TEXT: Record<string, Partial<Pick<Question, 'text' | 'help'>>> = {
  q8: { text: "When do you expect your next major expenditure (e.g., pay off flight-school loans, buy a home, fund a child's education), and how will you pay for it?" },
  q10: { help: 'For pilots, include disability and loss-of-license (medical certificate) coverage.' },
};

/**
 * Sprout: the same ten questions and point values, worded for a 16-year-old reader. Option text is kept (the labels
 * name the asset classes the student should learn), with a plain-English help line under each question.
 */
export const STUDENT_TEXT: Record<string, Partial<Pick<Question, 'text' | 'help'>>> = {
  q1: { text: 'If you invested {{amount}}, what would you want it to do?', help: 'Safety means keeping what you have. Growth means accepting ups and downs for a bigger number later.' },
  q2: { text: 'How much of {{amount}} would you be willing to risk losing for a chance to double it?', help: 'There is no right answer. This is about how you would feel, not what you know.' },
  q3: { text: 'How much have you invested before, and how do you feel about it?' },
  q4: { text: 'What is the riskiest kind of investment you would be okay owning?', help: 'From the top: cash-like accounts, then bonds (loans to governments and companies), then funds that own many stocks, then the most volatile corners of the market.' },
  q5: { text: 'Investments go up and down during a year. Which of these one-year ranges could you live with?', help: 'Each bar shows the high, middle and low value of {{amount}} after one year. Pick the widest swing you could sit through without selling.' },
  q6: { text: 'How much do you expect to add to this money over time?', help: 'A set amount every payday, even a small one, counts as a systematic plan.' },
  q7: { text: 'How long could this money stay invested before you need it, and how much do you need to be able to get at it quickly?', help: 'Money for next semester or a car next year is short-term. Money for your 30s is long-term.' },
  q8: { text: 'When is your next big expense (a car, moving out, tuition, a trip), and how will you pay for it?' },
  q9: { text: 'How long until you expect to stop working for pay?', help: 'For most students the honest answer is more than 30 years.' },
  q10: { text: 'Insurance covers surprises. How much do you have?', help: 'Count health insurance (a parent\'s plan counts), car insurance and renters insurance.' },
};

export function questionsFor(product: string | undefined | null): Question[] {
  if (product === 'flight-plan') return QUESTIONS.map((q) => (PILOT_TEXT[q.id] ? { ...q, ...PILOT_TEXT[q.id] } : q));
  if (product === 'sprout') return QUESTIONS.map((q) => (STUDENT_TEXT[q.id] ? { ...q, ...STUDENT_TEXT[q.id] } : q));
  return QUESTIONS;
}
