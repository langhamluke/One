/**
 * Risk questionnaire. Scoring structure follows the FNCE 2830 Investor Risk Questionnaire (CU Boulder) exactly:
 *   risk tolerance = Q1-Q6 (range 6-28): 6-9 Conservative, 10-16 Moderate, 17-23 Assertive, 24-28 Aggressive
 *   time horizon   = Q7-Q10 (range 4-20): 4-7 Short-term, 8-13 Intermediate, 14+ Long-term
 * Point values per question are the original ones. QUESTION AND OPTION TEXT BELOW IS A STAND-IN written to the same
 * structure; replace it with the exact text from Flight Plan's src/data/questionnaire.ts (TEXT_VERIFIED flips to true).
 */

export const TEXT_VERIFIED = false;
export const QUESTIONNAIRE_SOURCE =
  'Educational questionnaire adapted from FNCE 2830 (CU Boulder), which cites the Securities Industry Association Risk Tolerance Quiz and the ProQuest Risk Tolerance Questionnaire. Professional risk assessments are longer and more involved.';

export interface QuestionOption {
  label: string;
  points: number;
}

export interface Question {
  id: string;
  /** 'risk' for Q1-Q6, 'horizon' for Q7-Q10 */
  section: 'risk' | 'horizon';
  /** May contain {{amount}} which the UI substitutes with the formatted portfolio amount */
  text: string;
  options: QuestionOption[];
  /** Q5 only: outcome ranges as multiples of the portfolio amount [best, likelyHigh, likelyLow, worst] */
  ranges?: number[][];
  help?: string;
}

export const QUESTIONS: Question[] = [
  {
    id: 'q1',
    section: 'risk',
    text: 'Which statement best describes your attitude toward investment risk?',
    options: [
      { label: 'I avoid risk whenever possible, even if it means lower returns.', points: 1 },
      { label: 'I accept small risks for modest returns.', points: 2 },
      { label: 'I accept moderate risk for moderate long-term returns.', points: 3 },
      { label: 'I accept substantial risk for higher long-term returns.', points: 4 },
      { label: 'I seek maximum growth and accept large swings in value.', points: 5 },
    ],
  },
  {
    id: 'q2',
    section: 'risk',
    text: 'If your investments lost 20% of their value in a single month, what would you most likely do?',
    options: [
      { label: 'Sell everything to prevent further losses.', points: 1 },
      { label: 'Sell some and move it to safer investments.', points: 2 },
      { label: 'Hold everything and wait for a recovery.', points: 3 },
      { label: 'Buy more while prices are lower.', points: 4 },
    ],
  },
  {
    id: 'q3',
    section: 'risk',
    text: 'For money you will invest for ten years, which best-year / worst-year combination would you choose?',
    options: [
      { label: 'Best year +6%, worst year −2%', points: 1 },
      { label: 'Best year +10%, worst year −8%', points: 2 },
      { label: 'Best year +15%, worst year −16%', points: 3 },
      { label: 'Best year +22%, worst year −28%', points: 4 },
    ],
  },
  {
    id: 'q4',
    section: 'risk',
    text: 'How much investing experience do you have?',
    options: [
      { label: 'None.', points: 1 },
      { label: 'A savings account or CDs only.', points: 2 },
      { label: 'Funds inside a retirement plan.', points: 3 },
      { label: 'Individual stocks and funds in my own accounts.', points: 4 },
      { label: 'I actively manage a diversified portfolio.', points: 5 },
      { label: 'I have stayed invested through at least one major downturn.', points: 6 },
    ],
  },
  {
    id: 'q5',
    section: 'risk',
    text: 'You have {{amount}} to invest for one year. Which range of possible outcomes would you prefer?',
    options: [
      { label: 'Range 1', points: 1 },
      { label: 'Range 2', points: 2 },
      { label: 'Range 3', points: 3 },
      { label: 'Range 4', points: 4 },
      { label: 'Range 5', points: 5 },
    ],
    ranges: [
      [1.1, 1.03, 1.0, 0.95],
      [1.15, 1.08, 1.0, 0.92],
      [1.2, 1.1, 1.0, 0.9],
      [1.3, 1.15, 1.0, 0.85],
      [1.5, 1.2, 1.0, 0.75],
    ],
    help: 'Each bar shows the best case, the likely range, and the worst case after one year.',
  },
  {
    id: 'q6',
    section: 'risk',
    text: 'When you think of the word "risk", which of the following comes to mind first?',
    options: [
      { label: 'Loss', points: 1 },
      { label: 'Uncertainty', points: 2 },
      { label: 'Opportunity', points: 3 },
      { label: 'Thrill', points: 4 },
    ],
  },
  {
    id: 'q7',
    section: 'horizon',
    text: 'When do you expect to begin withdrawing money from this portfolio?',
    options: [
      { label: 'Within 3 years', points: 1 },
      { label: 'In 3 to 5 years', points: 2 },
      { label: 'In 6 to 10 years', points: 4 },
      { label: 'In more than 10 years', points: 6 },
    ],
  },
  {
    id: 'q8',
    section: 'horizon',
    text: 'Once you begin withdrawing, over how many years do you expect to spend the money?',
    options: [
      { label: '2 years or less', points: 1 },
      { label: '3 to 5 years', points: 2 },
      { label: '6 to 10 years', points: 3 },
      { label: 'More than 10 years', points: 5 },
    ],
  },
  {
    id: 'q9',
    section: 'horizon',
    text: 'How would you describe your income over the next five years?',
    options: [
      { label: 'Uncertain or likely to fall', points: 1 },
      { label: 'Somewhat stable', points: 2 },
      { label: 'Stable', points: 3 },
      { label: 'Stable and likely to grow', points: 5 },
    ],
  },
  {
    id: 'q10',
    section: 'horizon',
    text: 'What is your primary goal for this portfolio?',
    options: [
      { label: 'Preserve what I have', points: 1 },
      { label: 'Generate income', points: 2 },
      { label: 'Growth with some income', points: 3 },
      { label: 'Aggressive long-term growth', points: 4 },
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
