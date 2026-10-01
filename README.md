# 🌱 Sprout: money skills for students

Sprout helps high school and college students learn to **save**, **invest**, and **build credit**, with tools that make it simple and encouraging.

**Why:** In 2026, U.S. financial literacy fell to its lowest level in the 10-year history of the TIAA Institute–GFLEC Personal Finance Index (47% of questions answered correctly). Gen Z scored lowest of all generations, at 38%. Sprout targets students before the expensive mistakes happen.

## What's inside

| Area | Features |
|---|---|
| **Home** | Streaks, XP and levels, your top three "next best steps" pulled from every section, the next lesson, and your closest milestone bonuses |
| **Learn** | The centerpiece: 8 short lessons in three courses (Saving, Investing, Credit), each with a quiz. Finishing a course unlocks a savings bonus |
| **Savings** | Goals with progress and "save $X a month to hit it by…", a 50/30/20 budget with insights, emergency-fund targets, a compound-growth calculator, and a no-guilt small-habit calculator |
| **Portfolio** | Add holdings by ticker (about 50 common ETFs, stocks, and crypto built in, or any custom ticker). **Diversification score (0–100)** across 6 factors, asset and industry breakdowns, a fee analyzer, and plain-English tips |
| **Optimizer** | A **utility function**, U = E[r] − ½·A·σ², where you set your own risk aversion (A) with a slider or a preset. You can **optimize for your utility, return, risk, Sharpe ratio, or taxes**. Taxes means after-tax utility in a taxable brokerage account or a Roth IRA, using 2026 brackets. It also shows a risk-contribution breakdown, an action plan (invest new money without selling, or a full rebalance with an estimated capital-gains tax), and a Monte-Carlo "what could it grow to" projection |
| **Credit** | Credit health check based on FICO's published factor weights (an educational estimate, not a score), utilization tracker, minimum-payment-trap calculator, avalanche vs. snowball payoff, links to free real credit scores, and a starter-credit guide |
| **Rewards** | 19 milestones across saving, investing, credit, and learning. Each pays XP and a dollar bonus that's logged as a deposit into a savings goal. You name who funds the bonuses (a parent, a sponsor, or yourself) |

Everything runs in the browser. Data is saved only on the user's device (`localStorage`). There are no accounts, no bank logins, and no API keys.

## Run it on your computer

1. Install **Node.js 22** or newer from <https://nodejs.org> (pick the "LTS" button).
2. Download this repo (green **Code** button → **Download ZIP**, then unzip it), and open a terminal in that folder.
3. Run:

   ```bash
   npm install      # one-time: downloads the libraries
   npm run dev      # starts the app; open the link it prints (usually http://localhost:5173)
   ```

Other commands: `npm test` (runs the 30 finance and milestone tests), `npm run build` (creates the production site in `dist/`).

## Put it on the internet (free)

This repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that tests, builds, and publishes the site to **GitHub Pages** every time `main` changes. One-time setup:

1. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge the pull request into `main`. In about a minute the site is live at `https://langhamluke.github.io/One/`.

## Project layout

```
src/
  lib/          the finance engine (pure TypeScript, unit tested)
    portfolio.ts   diversification scoring + tips
    optimizer.ts   Black–Litterman / mean–variance optimizer, utility and after-tax optimization, Monte Carlo
    milestones.ts  milestone bonus rules
    savings.ts     compound growth, goals, 50/30/20 budget analysis
    credit.ts      payoff math, avalanche/snowball, utilization, credit check-up
  data/         securities catalog, lessons, sample student data
  pages/        one file per screen
  components/   shared UI pieces
  store.ts      app state, saved to the device
```

## Assumptions and sources (as of October 2026)

- Free-score and report sources: AnnualCreditReport.com (official free weekly reports), Experian, Capital One CreditWise, Discover Credit Scorecard, Credit Karma.
- Average credit card APR on new offers: about 21–24% (WalletHub, LendingTree, Federal Reserve G.19). The app defaults to 22%.
- High-yield savings: top accounts about 4–4.5% APY, versus a national average of about 0.4% (FDIC national rate). The app uses 4% and 0.4%.
- Optimizer: volatilities and correlations are rounded long-run figures. Expected returns are *implied* from global market weights (Black–Litterman, δ = 2.5, risk-free 4%). They are illustrative, not forecasts.
- Taxes: 2026 long-term capital gains are taxed at 0% for single filers under $49,450 of taxable income, and 15% above that. Short-term gains, interest, and REIT dividends are taxed as ordinary income.
- FICO factor weights: payment history 35%, amounts owed 30%, length of history 15%, new credit 10%, credit mix 10% (published by myFICO).

> Sprout is educational and is not financial advice. Projections are not guarantees.
