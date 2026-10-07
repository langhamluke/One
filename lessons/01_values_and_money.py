# Lesson 1: Values, variables, and the first money calculation
# Run this file with:  python3 lessons/01_values_and_money.py
# Read the comments (lines starting with #) as you go. Python ignores them.

# --- 1. A variable is a name for a value ---------------------------------
# The = sign does NOT mean "equals". It means "store the thing on the right
# under the name on the left".
principal = 10_000        # the underscore is just a readable thousands separator
annual_rate = 0.05        # 5% written as a decimal
years = 10

# --- 2. Arithmetic works the way you expect ------------------------------
# ** is "to the power of". Compound interest: P * (1 + r) ** n
future_value = principal * (1 + annual_rate) ** years

# --- 3. print() shows a value on screen; f-strings put values inside text --
# The f before the quote lets you drop variables in with {curly braces}.
# :,.2f means: thousands commas, 2 decimal places, fixed-point.
print(f"Start:  ${principal:,.2f}")
print(f"Rate:   {annual_rate:.1%}")          # :.1% formats 0.05 as 5.0%
print(f"After {years} years: ${future_value:,.2f}")

# --- 4. The gotcha every finance programmer must know --------------------
# Computers store decimals in binary, so some "simple" decimals are inexact.
print(0.1 + 0.2)              # you would expect 0.3 ...
print(0.1 + 0.2 == 0.3)       # ... and this is False!

# For analysis (returns, statistics, charts) the tiny error is irrelevant.
# For accounting (ledgers, invoices, anything that must reconcile to the cent)
# use the Decimal type, which works in base 10 like a calculator does.
from decimal import Decimal
print(Decimal("0.1") + Decimal("0.2"))      # exactly 0.3
# Note the quotes: Decimal("0.1") not Decimal(0.1). The quoted text is exact;
# the bare 0.1 is already inexact before Decimal ever sees it.

# --- 5. A function is a reusable calculation -----------------------------
# def names it, the parentheses list its inputs, return hands back the answer.
def future_value_of(amount, rate, n_years):
    return amount * (1 + rate) ** n_years

# Now the same calculation works for any inputs:
print(future_value_of(10_000, 0.05, 10))
print(future_value_of(2_500, 0.07, 30))

# --- YOUR TURN ------------------------------------------------------------
# Write a function called present_value_of(amount, rate, n_years) that does
# the reverse: how much you need today to have `amount` in n_years.
# Formula: amount / (1 + rate) ** n_years
# Then call it with (10_000, 0.05, 10) and print the result.
# Sanity check: feeding that result back into future_value_of should give
# you 10_000 again.
