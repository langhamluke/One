export type Track = 'Saving' | 'Investing' | 'Credit';

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Lesson {
  id: string;
  track: Track;
  title: string;
  emoji: string;
  minutes: number;
  xp: number;
  cards: { heading: string; body: string }[];
  quiz: QuizQuestion[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'pay-yourself-first',
    track: 'Saving',
    title: 'Pay yourself first',
    emoji: '🐷',
    minutes: 3,
    xp: 50,
    cards: [
      {
        heading: 'Save before you spend',
        body: 'Most people save whatever is left at the end of the month — which is usually nothing. Flip it: the moment money comes in, move a set amount to savings, then spend the rest guilt-free.',
      },
      {
        heading: 'Automate it',
        body: 'Set an automatic transfer on payday. Even $10 a week becomes $520 a year. Because you never see it in your checking account, you won’t miss it.',
      },
      {
        heading: 'Where to keep it',
        body: 'A high-yield savings account (HYSA) at an FDIC-insured bank pays far more than a typical savings account. In late 2026 the best HYSAs pay around 4% APY, while the national average is under 0.5%. Deposits are insured up to $250,000.',
      },
    ],
    quiz: [
      {
        q: 'What does “pay yourself first” mean?',
        options: ['Buy something nice on payday', 'Move money to savings before spending', 'Pay your bills before anything else', 'Ask for a raise'],
        answer: 1,
        why: 'You treat savings like a bill to yourself that gets paid the moment income arrives.',
      },
      {
        q: 'Saving $10 a week adds up to about how much in a year?',
        options: ['$120', '$365', '$520', '$1,000'],
        answer: 2,
        why: '$10 × 52 weeks = $520 — before any interest.',
      },
      {
        q: 'Up to what amount does FDIC insurance protect bank deposits (per depositor, per bank, per ownership category)?',
        options: ['$25,000', '$100,000', '$250,000', 'Unlimited'],
        answer: 2,
        why: 'The standard FDIC insurance amount is $250,000.',
      },
    ],
  },
  {
    id: 'budget-50-30-20',
    track: 'Saving',
    title: 'The 50/30/20 budget',
    emoji: '🧾',
    minutes: 4,
    xp: 50,
    cards: [
      {
        heading: 'A simple starting point',
        body: 'Split take-home pay into about 50% needs (rent, groceries, phone, transport), 30% wants (eating out, games, clothes), and 20% savings and debt payoff.',
      },
      {
        heading: 'Needs vs. wants',
        body: 'A need is something you’d have to replace if it disappeared — like food or a way to get to work. Wants make life fun. Both are fine! The goal is knowing which is which.',
      },
      {
        heading: 'Adjust it to your life',
        body: 'Living at home? You might do 20/40/40. Paying rent at college? Maybe 65/20/15. The numbers are a guide. Tracking where your money goes is what matters.',
      },
    ],
    quiz: [
      {
        q: 'In the 50/30/20 rule, the 20% goes to…',
        options: ['Wants', 'Needs', 'Savings and paying down debt', 'Taxes'],
        answer: 2,
        why: '20% is for your future: savings, investing, and extra debt payments.',
      },
      {
        q: 'Which of these is a “want”?',
        options: ['Groceries', 'Bus pass to get to work', 'A concert ticket', 'Rent'],
        answer: 2,
        why: 'Concerts are fun but optional, which makes them a want.',
      },
      {
        q: 'Your income is $800/month. About how much does 50/30/20 suggest saving?',
        options: ['$80', '$160', '$240', '$400'],
        answer: 1,
        why: '20% of $800 = $160.',
      },
    ],
  },
  {
    id: 'emergency-fund',
    track: 'Saving',
    title: 'Your emergency fund',
    emoji: '🛟',
    minutes: 3,
    xp: 50,
    cards: [
      {
        heading: 'Life happens',
        body: 'A flat tire, a broken phone screen, a surprise medical bill. Without savings, emergencies end up on a credit card at 20%+ interest.',
      },
      {
        heading: 'Start small, then build',
        body: 'Aim for a starter cushion of $500–$1,000 first. Then build toward 3 months of essential expenses. Keep it separate from your spending money so it doesn’t get used for wants.',
      },
      {
        heading: 'Not for investing',
        body: 'Emergency money needs to be there when you need it, so keep it in a savings account, not the stock market, which can be down 30% right when you need the cash.',
      },
    ],
    quiz: [
      {
        q: 'A good first emergency-fund milestone for a student is…',
        options: ['$50', '$500–$1,000', '$20,000', 'Nothing — use a credit card'],
        answer: 1,
        why: 'A starter cushion covers most common surprises without debt.',
      },
      {
        q: 'Where should an emergency fund usually live?',
        options: ['Individual stocks', 'Crypto', 'A high-yield savings account', 'Under your mattress'],
        answer: 2,
        why: 'It should be safe, easy to reach, and still earn some interest.',
      },
      {
        q: 'Why not invest your emergency fund in stocks?',
        options: ['Stocks are illegal for students', 'Stocks can be down right when you need the money', 'Stocks never grow', 'Banks don’t allow it'],
        answer: 1,
        why: 'Markets can drop sharply in the short run, which is exactly when emergencies tend to hit.',
      },
    ],
  },
  {
    id: 'compound-interest',
    track: 'Investing',
    title: 'Compound interest: your superpower',
    emoji: '📈',
    minutes: 4,
    xp: 60,
    cards: [
      {
        heading: 'Interest on your interest',
        body: 'When your investments earn a return, next year you earn a return on the original money and on last year’s gains. Over decades, this snowballs.',
      },
      {
        heading: 'Time beats timing',
        body: 'Investing $100/month from age 18 to 65 at a hypothetical 7% average return grows to roughly $400,000+. Starting at 28 instead gives roughly half that. Those first 10 years matter a lot.',
      },
      {
        heading: 'The Rule of 72',
        body: 'Divide 72 by your annual return to estimate how many years it takes money to double. At 8%, money doubles about every 9 years.',
      },
    ],
    quiz: [
      {
        q: 'Using the Rule of 72, money earning 6% a year doubles in about…',
        options: ['6 years', '12 years', '20 years', '72 years'],
        answer: 1,
        why: '72 ÷ 6 = 12 years.',
      },
      {
        q: 'What is the biggest advantage young investors have?',
        options: ['More money', 'Inside information', 'Time', 'Luck'],
        answer: 2,
        why: 'Decades of compounding can matter more than the amount you start with.',
      },
      {
        q: 'Compound interest means you earn returns on…',
        options: ['Only what you deposit', 'Your deposits and past earnings', 'Only past earnings', 'Nothing until retirement'],
        answer: 1,
        why: 'Your earnings start earning too. That’s the snowball.',
      },
    ],
  },
  {
    id: 'diversification',
    track: 'Investing',
    title: 'Don’t put all your eggs in one basket',
    emoji: '🧺',
    minutes: 5,
    xp: 60,
    cards: [
      {
        heading: 'What diversification means',
        body: 'Owning many different investments so that one bad outcome can’t sink you. If you own one company and it fails, you lose everything. If you own 3,000 companies, one failure barely registers.',
      },
      {
        heading: 'Index funds make it easy',
        body: 'An index fund (or ETF) holds every company in an index for a tiny fee. One total-market fund can own thousands of companies, and you can buy a slice of it for a few dollars with fractional shares.',
      },
      {
        heading: 'Diversify across types and places',
        body: 'Spread money across asset classes (stocks, bonds, cash) and regions (U.S. and international). Bonds usually fall less than stocks in a crash, and other countries’ markets sometimes lead for a decade.',
      },
    ],
    quiz: [
      {
        q: 'Which portfolio is most diversified?',
        options: ['100% in one tech stock', '5 tech stocks', 'A total world stock index fund', '100% Bitcoin'],
        answer: 2,
        why: 'A total world index fund holds thousands of companies across dozens of countries.',
      },
      {
        q: 'An ETF is…',
        options: ['A single company’s stock', 'A basket of investments that trades like a stock', 'A type of savings account', 'A government bond'],
        answer: 1,
        why: 'Exchange-traded funds bundle many holdings into one ticker you can buy anytime the market is open.',
      },
      {
        q: 'Why do many investors hold some bonds?',
        options: ['Bonds always beat stocks', 'Bonds tend to fall less in stock market crashes', 'Bonds are tax-free', 'Bonds are required by law'],
        answer: 1,
        why: 'Bonds are generally less volatile and can cushion a portfolio when stocks drop.',
      },
    ],
  },
  {
    id: 'fees-and-accounts',
    track: 'Investing',
    title: 'Fees, Roth IRAs & where to invest',
    emoji: '🏦',
    minutes: 5,
    xp: 60,
    cards: [
      {
        heading: 'Fees compound too',
        body: 'An expense ratio is the yearly fee a fund charges. 0.03% costs $3 per $10,000. 1% costs $100, and over 30 years it can eat about a quarter of your ending balance.',
      },
      {
        heading: 'The Roth IRA',
        body: 'If you have earned income (a job, even part-time), you can contribute to a Roth IRA, up to the smaller of your earnings or the annual IRS limit. You invest after-tax money, and qualified withdrawals in retirement are tax-free. Minors can open a custodial Roth IRA with a parent.',
      },
      {
        heading: 'Getting started',
        body: 'Big brokerages offer $0 commissions, no minimums, and fractional shares. Many people start with one target-date fund or a simple “three-fund portfolio”: U.S. stocks, international stocks, and bonds.',
      },
    ],
    quiz: [
      {
        q: 'A fund with a 0.05% expense ratio costs how much per year on $10,000?',
        options: ['$0.50', '$5', '$50', '$500'],
        answer: 1,
        why: '0.05% × $10,000 = $5.',
      },
      {
        q: 'What do you need to contribute to a Roth IRA?',
        options: ['To be 21 or older', 'Earned income', 'A credit card', '$10,000 to start'],
        answer: 1,
        why: 'Contributions are limited to your earned income for the year (up to the annual cap).',
      },
      {
        q: 'What is a “three-fund portfolio”?',
        options: ['Three tech stocks', 'U.S. stocks + international stocks + bonds', 'Three savings accounts', 'Three cryptocurrencies'],
        answer: 1,
        why: 'Three broad index funds can cover most of the world’s investable market.',
      },
    ],
  },
  {
    id: 'credit-score-basics',
    track: 'Credit',
    title: 'How credit scores work',
    emoji: '💳',
    minutes: 5,
    xp: 60,
    cards: [
      {
        heading: 'What a score is',
        body: 'A credit score (usually 300–850) predicts how likely you are to repay debt. Landlords, lenders, and even some employers and phone carriers check your credit. A higher score means lower interest rates.',
      },
      {
        heading: 'The five factors (FICO)',
        body: 'Payment history 35% · Amounts owed / utilization 30% · Length of history 15% · New credit 10% · Credit mix 10%. Paying on time and keeping balances low are about two-thirds of the score.',
      },
      {
        heading: 'Check it free',
        body: 'You can get your credit reports free every week from all three bureaus at AnnualCreditReport.com, the official site. Many banking apps also show a free score.',
      },
    ],
    quiz: [
      {
        q: 'Which factor matters most for a FICO score?',
        options: ['Credit mix', 'Payment history', 'Number of cards', 'Income'],
        answer: 1,
        why: 'Payment history is about 35% of the score.',
      },
      {
        q: 'Credit utilization is…',
        options: ['How many cards you have', 'Your balances divided by your credit limits', 'Your income', 'Your age'],
        answer: 1,
        why: 'Using $300 of a $1,000 limit is 30% utilization.',
      },
      {
        q: 'Is your income part of your credit score?',
        options: ['Yes, it’s the biggest factor', 'No', 'Only if you’re a student', 'Only for mortgages'],
        answer: 1,
        why: 'Scores are based on your credit report, which doesn’t include income.',
      },
    ],
  },
  {
    id: 'using-credit-cards',
    track: 'Credit',
    title: 'Using a credit card the smart way',
    emoji: '✅',
    minutes: 4,
    xp: 60,
    cards: [
      {
        heading: 'Pay the full statement balance',
        body: 'Pay your full statement balance by the due date and you pay $0 interest, thanks to the grace period. Carry a balance and you’re charged interest, often 20–25% APR.',
      },
      {
        heading: 'The minimum-payment trap',
        body: 'Paying only the minimum on $3,000 at 22% APR can take well over a decade and cost thousands in interest. Use the payoff calculator to see your own numbers.',
      },
      {
        heading: 'Build credit safely',
        body: 'Start with one card, put one small recurring bill on it, set autopay to the full balance, and keep utilization under 30% (10% is even better). If you’re under 21, you’ll need your own income or a co-signer under the CARD Act, or you can start as an authorized user.',
      },
    ],
    quiz: [
      {
        q: 'How do you avoid paying credit card interest?',
        options: ['Pay the minimum on time', 'Pay the full statement balance by the due date', 'Only use it online', 'Close the card yearly'],
        answer: 1,
        why: 'Paying in full every month keeps your grace period, so no interest is charged on purchases.',
      },
      {
        q: 'You have a $1,000 limit. To stay under 30% utilization, keep your balance below…',
        options: ['$30', '$100', '$300', '$900'],
        answer: 2,
        why: '30% × $1,000 = $300.',
      },
      {
        q: 'What’s the cheapest way to pay off several cards (least total interest)?',
        options: ['Smallest balance first (snowball)', 'Highest interest rate first (avalanche)', 'Pay them all equally', 'Pay whichever is newest'],
        answer: 1,
        why: 'The avalanche method attacks the most expensive debt first. Snowball can feel more motivating, though.',
      },
    ],
  },
];

export const TRACKS: Track[] = ['Saving', 'Investing', 'Credit'];
