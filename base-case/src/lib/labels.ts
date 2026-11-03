/** Human labels for PlanState keys (used by the proposal diff and assumption panels). */
const LEAF: Record<string, string> = {
  nickname: 'Nickname', age: 'Age', retirementAge: 'Retirement age', filingStatus: 'Filing status', stateCode: 'State',
  customStateRate: 'Custom state rate', metro: 'Metro', dependents: 'Dependents', spouseIncome: 'Spouse income',
  livingExpenses: 'Living expenses', housingCost: 'Housing cost', graduationYear: 'Graduation year', degree: 'Degree',
  fieldOfStudy: 'Field of study',
  cash: 'Cash', taxable: 'Taxable', preTax: 'Pre-tax', roth: 'Roth', hsa: 'HSA', otherAssets: 'Other assets',
  name: 'Name', kind: 'Kind', balance: 'Balance', rate: 'Rate', termMonths: 'Term (months)', payment: 'Payment override',
  extraPayment: 'Extra payment', federalPlan: 'Federal plan', legacyBorrower: 'Legacy borrower', originalBalance: 'Original balance',
  graceMonths: 'Grace months',
  matchRate: 'Match rate', matchCapPct: 'Match cap', nonElectivePct: 'Non-elective', hsaEligible: 'HSA eligible',
  employerHsaContribution: 'Employer HSA seed', studentLoanMatch: 'Student-loan match', employerLoanRepayment: 'Employer loan repayment',
  enabled: 'Enabled', multiplier: 'Multiplier', employeeContribPct: 'Employee contribution', vestingYears: 'Vesting years',
  normalRetirementAge: 'Normal retirement age', coveredBySocialSecurity: 'Covered by Social Security',
  annualRsuValue: 'Annual RSU value', esppDiscount: 'ESPP discount', esppContribPct: 'ESPP contribution',
  disabilityCoverage: 'Disability coverage', lifeCoverageMultiple: 'Life coverage multiple',
  deferralPct: 'Deferral', deferralType: 'Deferral type', rothSplit: 'Roth split', hsaContribution: 'HSA contribution',
  iraContribution: 'IRA contribution', iraType: 'IRA type', taxableContribution: 'Taxable contribution',
  emergencyFundMonthsOverride: 'Emergency fund months override',
  targetAmount: 'Target amount', targetYear: 'Target year', priority: 'Priority', fundedSoFar: 'Funded so far',
  price: 'Price', downPct: 'Down payment', mortgageRate: 'Mortgage rate', termYears: 'Term (years)', propertyTaxPct: 'Property tax',
  maintenancePct: 'Maintenance',
  disability: 'Disability insurance', life: 'Life insurance', health: 'Health coverage', renters: 'Renters insurance',
  portfolioAmount: 'Portfolio amount (Q5)', occupationCode: 'Occupation', track: 'Track', startLevelIndex: 'Start level',
  meritRaise: 'Merit raise', bonusPctOverride: 'Bonus override', startYearOffset: 'Start year offset', preStartIncome: 'Pre-start income',
  industryDrift: 'Industry drift', activePathId: 'Active path', title: 'Title', years: 'Years', bonusPct: 'Bonus',
  promotionDelayYears: 'Promotion delay (years)', layoffGapMonths: 'Layoff gap (months)', layoffYearOffset: 'Layoff year offset',
  annualCost: 'Annual cost', financedPct: 'Financed share', loanRate: 'Loan rate', incomeDuring: 'Income during school',
  postOccupationCode: 'Post-school occupation', postLevelIndex: 'Post-school level', postPremium: 'Post-school premium',
  extraSavingsRatePct: 'Extra savings rate', retireAtOverride: 'Retire-at override', spendingCut: 'Spending cut',
  inflation: 'Inflation', ret: 'Expected return', vol: 'Volatility', glideYears: 'Glide years', landingEquity: 'Landing equity',
  equityOverride: 'Equity override', mcSims: 'Monte Carlo sims', seed: 'Seed', incomeReplacement: 'Income replacement',
  retirementSpendingOverride: 'Retirement spending override', ssClaimAge: 'SS claim age', ssOverrideAnnual: 'SS override (annual)',
  ssHaircut: 'SS haircut', taxGrossUp: 'Tax gross-up', lifeExpectancy: 'Life expectancy', emergencyMonthsDefault: 'Emergency months default',
  cashYield: 'Cash yield', lifestyleCreep: 'Lifestyle creep', indexing: 'Indexing', notes: 'Notes', version: 'Version',
};

const SECTION: Record<string, string> = {
  profile: 'Profile', balanceSheet: 'Balance sheet', debts: 'Debt', benefits: 'Benefits', pension: 'Pension',
  equityComp: 'Equity comp', savings: 'Savings', goals: 'Goal', home: 'Home', insurance: 'Insurance', answers: 'Questionnaire',
  supplement: 'Supplement', careerPaths: 'Career path', customLevels: 'Level', yearsOverrides: 'Years in level', whatIf: 'What-if',
  gradSchool: 'Grad school', assumptions: 'Assumptions', cma: 'CMA', band: 'Band', value: 'Value',
  uslc: 'US Large Cap', ussmid: 'US Small/Mid', intl: 'Intl Developed', em: 'Emerging', bonds: 'Bonds', tips: 'TIPS',
};

/** 'debts[1].rate' -> 'Debt 2 · Rate'; 'answers.q3' -> 'Questionnaire · Q3' */
export function labelForPath(path: string): string {
  const parts = path.split('.');
  const out: string[] = [];
  for (const raw of parts) {
    const m = raw.match(/^(\w+)\[(\d+)\]$/);
    if (m) {
      out.push(`${SECTION[m[1]] ?? LEAF[m[1]] ?? m[1]} ${Number(m[2]) + 1}`);
      continue;
    }
    if (/^q\d+$/.test(raw) || /^s\d+$/.test(raw)) {
      out.push(raw.toUpperCase());
      continue;
    }
    out.push(SECTION[raw] ?? LEAF[raw] ?? raw);
  }
  return out.join(' · ');
}
