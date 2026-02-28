# IBM Datathon — Macro Economic Indicator Ingestion

## Project Goal

This project ingests macroeconomic time-series data from the [Federal Reserve Economic Data (FRED)](https://fred.stlouisfed.org/) API to support predictive modeling and economic analysis for the IBM Datathon.

The goal is to build a clean, merged dataset of key U.S. economic indicators that can be used as features for downstream machine learning models or exploratory analysis.

---

## What It Does

The ingestion pipeline pulls the following categories of monthly data from FRED:

- **Interest Rates** — Federal Funds Rate, Treasury yield spreads, corporate bond yields
- **Housing** — Housing starts and building permits (seasonally adjusted and raw)
- **Inflation** — CPI (headline and core), PCE price indexes
- **Unemployment** — Unemployment rate, labor force levels, employment totals

All series are fetched, aligned on date, and merged into a single wide-format DataFrame for analysis.


## Goal
- Get kalshi data and find price mismatches off prediction markets
---

## Output

A merged Pandas DataFrame (`macro_df`) with one row per date and one column per economic series, ready for feature engineering or model training.
