"""Black-Scholes-Merton pricing, greeks, and implied volatility.

Own implementation (no GPL dependencies). Vectorized over numpy arrays.
Conventions: S spot, K strike, T years to expiry, r continuous risk-free,
q continuous dividend yield, sigma annualized vol, cp = +1 call / -1 put.
"""
from __future__ import annotations

import numpy as np
from scipy.special import ndtr
from scipy.optimize import brentq

SQRT_2PI = np.sqrt(2.0 * np.pi)


def _pdf(x):
    return np.exp(-0.5 * np.square(x)) / SQRT_2PI


def d1d2(S, K, T, r, sigma, q=0.0):
    S, K, T, sigma = (np.asarray(x, dtype=float) for x in (S, K, T, sigma))
    T = np.maximum(T, 1e-8)
    sigma = np.maximum(sigma, 1e-8)
    v = sigma * np.sqrt(T)
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / v
    return d1, d1 - v


def price(S, K, T, r, sigma, cp=1, q=0.0):
    d1, d2 = d1d2(S, K, T, r, sigma, q)
    cp = np.asarray(cp, dtype=float)
    T = np.maximum(np.asarray(T, dtype=float), 1e-8)
    return cp * (np.asarray(S) * np.exp(-q * T) * ndtr(cp * d1) - np.asarray(K) * np.exp(-r * T) * ndtr(cp * d2))


def delta(S, K, T, r, sigma, cp=1, q=0.0):
    d1, _ = d1d2(S, K, T, r, sigma, q)
    cp = np.asarray(cp, dtype=float)
    return cp * np.exp(-q * np.maximum(T, 1e-8)) * ndtr(cp * d1)


def gamma(S, K, T, r, sigma, q=0.0):
    d1, _ = d1d2(S, K, T, r, sigma, q)
    T = np.maximum(np.asarray(T, dtype=float), 1e-8)
    sigma = np.maximum(np.asarray(sigma, dtype=float), 1e-8)
    return np.exp(-q * T) * _pdf(d1) / (np.asarray(S) * sigma * np.sqrt(T))


def vega(S, K, T, r, sigma, q=0.0):
    """Per 1.00 (100 vol points) change in sigma."""
    d1, _ = d1d2(S, K, T, r, sigma, q)
    T = np.maximum(np.asarray(T, dtype=float), 1e-8)
    return np.asarray(S) * np.exp(-q * T) * _pdf(d1) * np.sqrt(T)


def theta(S, K, T, r, sigma, cp=1, q=0.0):
    """Per year. Divide by 365 for per calendar day."""
    d1, d2 = d1d2(S, K, T, r, sigma, q)
    T = np.maximum(np.asarray(T, dtype=float), 1e-8)
    sigma = np.maximum(np.asarray(sigma, dtype=float), 1e-8)
    cp = np.asarray(cp, dtype=float)
    S = np.asarray(S, dtype=float)
    K = np.asarray(K, dtype=float)
    first = -S * np.exp(-q * T) * _pdf(d1) * sigma / (2 * np.sqrt(T))
    second = -cp * r * K * np.exp(-r * T) * ndtr(cp * d2)
    third = cp * q * S * np.exp(-q * T) * ndtr(cp * d1)
    return first + second + third


def vanna(S, K, T, r, sigma, q=0.0):
    """dDelta/dSigma = dVega/dSpot (per 1.00 vol)."""
    d1, d2 = d1d2(S, K, T, r, sigma, q)
    T = np.maximum(np.asarray(T, dtype=float), 1e-8)
    sigma = np.maximum(np.asarray(sigma, dtype=float), 1e-8)
    return -np.exp(-q * T) * _pdf(d1) * d2 / sigma


def charm(S, K, T, r, sigma, cp=1, q=0.0):
    """dDelta/dTime (per year). Negative of delta decay."""
    d1, d2 = d1d2(S, K, T, r, sigma, q)
    T = np.maximum(np.asarray(T, dtype=float), 1e-8)
    sigma = np.maximum(np.asarray(sigma, dtype=float), 1e-8)
    cp = np.asarray(cp, dtype=float)
    v = sigma * np.sqrt(T)
    core = np.exp(-q * T) * _pdf(d1) * (2 * (r - q) * T - d2 * v) / (2 * T * v)
    return cp * q * np.exp(-q * T) * ndtr(cp * d1) - core


def implied_vol(target, S, K, T, r, cp=1, q=0.0, lo=1e-4, hi=5.0):
    """Scalar implied vol by bracketing. Returns nan when no solution."""
    try:
        intrinsic = max(cp * (S * np.exp(-q * T) - K * np.exp(-r * T)), 0.0)
        if target <= intrinsic + 1e-10:
            return float("nan")
        f = lambda s: float(price(S, K, T, r, s, cp, q)) - target
        if f(lo) > 0 or f(hi) < 0:
            return float("nan")
        return float(brentq(f, lo, hi, xtol=1e-8, maxiter=100))
    except Exception:
        return float("nan")


def implied_vol_vec(targets, S, K, T, r, cp, q=0.0):
    targets, K, T, cp = (np.asarray(x, dtype=float) for x in (targets, K, T, cp))
    out = np.full(targets.shape, np.nan)
    for i in range(targets.size):
        out[i] = implied_vol(targets[i], S, K[i], T[i], r, cp[i], q)
    return out
