"""
STOCKPULSE — EDA Analysis Module
Performs all exploratory data analysis on stock market CSV data.
"""

from __future__ import annotations
import pandas as pd
import numpy as np
import json
import os
from typing import Optional


REQUIRED_COLUMNS = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
NUMERIC_COLUMNS  = ['Open', 'High', 'Low', 'Close', 'Volume']


# ──────────────────────────────────────────────────────────────
# 1. VALIDATION & CLEANING
# ──────────────────────────────────────────────────────────────


def normalize_stock_csv(df):
    original_cols = df.columns.tolist()
    
    # 1. Clean column names
    df.columns = [str(c).strip() for c in df.columns]
    
    col_map = {c.lower(): c for c in df.columns}
    
    rename_map = {}
    detected_format = "Standard Format"
    
    if "close" in col_map:
        rename_map[col_map["close"]] = "Close"
    elif "price" in col_map:
        rename_map[col_map["price"]] = "Close"
        detected_format = "NIFTY Historical Data"
        
    if "volume" in col_map:
        rename_map[col_map["volume"]] = "Volume"
    elif "vol." in col_map:
        rename_map[col_map["vol."]] = "Volume"
        detected_format = "NIFTY Historical Data"
        
    for req in ["date", "open", "high", "low"]:
        if req in col_map:
            rename_map[col_map[req]] = req.capitalize()
            
    df = df.rename(columns=rename_map)
    
    required = ["Date", "Open", "High", "Low", "Close", "Volume"]
    missing = [req for req in required if req not in df.columns]
    
    if missing:
        errors = [
            "Dataset validation failed.",
            f"Missing required columns: {', '.join(missing)}.",
            "Expected either 'Close' or 'Price' for closing price.",
            "Expected either 'Volume' or 'Vol.' for volume."
        ]
        return {"success": False, "errors": errors}
        
    normalized_cols = df.columns.tolist()
    mappings = {k: v for k, v in rename_map.items() if k != v}
    
    report = {
        "original_rows": len(df),
        "original_cols": len(original_cols),
        "missing_values": 0,
        "duplicate_rows": 0,
        "invalid_values": 0,
        "rows_after_clean": 0,
    }
    
    import pandas as pd
    import numpy as np
    
    dupes = df.duplicated().sum()
    report["duplicate_rows"] = int(dupes)
    df = df.drop_duplicates()
    
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    date_nulls = df['Date'].isna().sum()
    report["invalid_values"] += int(date_nulls)
    df = df.dropna(subset=['Date'])
    
    df = df.sort_values('Date')
    df = df.drop_duplicates(subset=['Date'])
    
    def clean_price(val):
        if pd.isna(val): return np.nan
        if isinstance(val, (int, float)): return float(val)
        val = str(val).replace(',', '').replace(' ', '').replace('₹', '').replace('$', '').replace('€', '')
        try: return float(val)
        except: return np.nan

    for col in ['Open', 'High', 'Low', 'Close']:
        before_nulls = df[col].isna().sum()
        df[col] = df[col].apply(clean_price)
        after_nulls = df[col].isna().sum()
        report["invalid_values"] += int(after_nulls - before_nulls)
        
    def clean_volume(val):
        if pd.isna(val): return np.nan
        if isinstance(val, (int, float)): return float(val)
        val = str(val).upper().strip().replace(',', '').replace(' ', '')
        multiplier = 1
        if val.endswith('K'): multiplier = 1e3; val = val[:-1]
        elif val.endswith('M'): multiplier = 1e6; val = val[:-1]
        elif val.endswith('B'): multiplier = 1e9; val = val[:-1]
        try: return float(val) * multiplier
        except: return np.nan
            
    before_nulls = df['Volume'].isna().sum()
    df['Volume'] = df['Volume'].apply(clean_volume)
    after_nulls = df['Volume'].isna().sum()
    report["invalid_values"] += int(after_nulls - before_nulls)
    
    report["missing_values"] = int(df[required].isna().sum().sum())
    
    df = df.dropna(subset=required).reset_index(drop=True)
    report["rows_after_clean"] = len(df)
    
    return {
        "success": True,
        "df": df,
        "quality_report": report,
        "format_info": {
            "source_format": detected_format,
            "detected_columns": original_cols,
            "normalized_columns": normalized_cols,
            "mappings": mappings
        }
    }


# ──────────────────────────────────────────────────────────────
# 2. DERIVED FEATURES
# ──────────────────────────────────────────────────────────────

def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add all derived EDA columns to the dataframe."""
    df = df.copy()

    # Price change
    df['Price_Change'] = df['Close'].diff()

    # Daily return (%)
    df['Daily_Return'] = df['Close'].pct_change() * 100

    # Moving averages
    df['MA_20'] = df['Close'].rolling(window=20).mean()
    df['MA_50'] = df['Close'].rolling(window=50).mean()

    # Rolling volatility (20-day std of daily returns)
    df['Volatility_20'] = df['Daily_Return'].rolling(window=20).std()

    # Format Date for JSON serialisation
    df['Date_str'] = df['Date'].dt.strftime('%Y-%m-%d')

    return df


# ──────────────────────────────────────────────────────────────
# 3. STATISTICS
# ──────────────────────────────────────────────────────────────

def compute_summary_stats(df: pd.DataFrame) -> dict:
    """Compute basic summary statistics for all numeric columns."""
    stats = {}
    for col in ['Open', 'High', 'Low', 'Close', 'Volume', 'Daily_Return']:
        if col in df.columns:
            s = df[col].dropna()
            stats[col] = {
                "count":  round(float(s.count()), 4),
                "mean":   round(float(s.mean()),  4),
                "median": round(float(s.median()),4),
                "std":    round(float(s.std()),   4),
                "min":    round(float(s.min()),   4),
                "max":    round(float(s.max()),   4),
                "q25":    round(float(s.quantile(0.25)), 4),
                "q75":    round(float(s.quantile(0.75)), 4),
            }
    return stats


def compute_correlation(df: pd.DataFrame) -> dict:
    """Compute correlation matrix for key columns."""
    cols = [c for c in ['Open','High','Low','Close','Volume','Daily_Return'] if c in df.columns]
    corr_df = df[cols].dropna().corr()

    # Flatten for front-end use
    matrix = corr_df.values.tolist()
    labels = corr_df.columns.tolist()

    # Find strongest positive and negative (excluding self-correlations)
    corr_flat = corr_df.where(~np.eye(len(cols), dtype=bool)).stack()
    strongest_pos = corr_flat.idxmax() if not corr_flat.empty else None
    strongest_neg = corr_flat.idxmin() if not corr_flat.empty else None

    return {
        "labels": labels,
        "matrix": [[round(v, 4) for v in row] for row in matrix],
        "strongest_positive": list(strongest_pos) if strongest_pos else [],
        "strongest_negative": list(strongest_neg) if strongest_neg else [],
        "pos_value": round(float(corr_flat.max()), 4) if not corr_flat.empty else 0,
        "neg_value": round(float(corr_flat.min()), 4) if not corr_flat.empty else 0,
    }


# ──────────────────────────────────────────────────────────────
# 4. TREND ANALYSIS
# ──────────────────────────────────────────────────────────────

def compute_trend(df: pd.DataFrame) -> dict:
    """
    Simple linear regression on Close prices to estimate trend.
    Returns direction, strength, and key price points.
    """
    close = df['Close'].dropna()
    n     = len(close)

    if n < 2:
        return {"direction": "UNKNOWN", "strength": 0}

    x    = np.arange(n)
    slope, intercept = np.polyfit(x, close.values, 1)

    # Trend direction
    pct_change_total = ((close.iloc[-1] - close.iloc[0]) / close.iloc[0]) * 100
    if pct_change_total > 5:
        direction = "BULLISH"
    elif pct_change_total < -5:
        direction = "BEARISH"
    else:
        direction = "SIDEWAYS"

    # R² as a proxy for trend strength
    y_pred = intercept + slope * x
    ss_res = np.sum((close.values - y_pred) ** 2)
    ss_tot = np.sum((close.values - close.mean()) ** 2)
    r2     = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0

    strength_pct = round(abs(r2) * 100, 2)

    idx_max = df['Close'].idxmax()
    idx_min = df['Close'].idxmin()

    return {
        "direction":        direction,
        "strength":         strength_pct,
        "total_change_pct": round(float(pct_change_total), 2),
        "highest_price":    round(float(df.loc[idx_max, 'Close']), 2),
        "highest_date":     df.loc[idx_max, 'Date_str'],
        "lowest_price":     round(float(df.loc[idx_min, 'Close']), 2),
        "lowest_date":      df.loc[idx_min, 'Date_str'],
    }


# ──────────────────────────────────────────────────────────────
# 5. VOLATILITY ANALYSIS
# ──────────────────────────────────────────────────────────────

def compute_volatility_stats(df: pd.DataFrame) -> dict:
    vol = df['Volatility_20'].dropna()

    current_vol = round(float(vol.iloc[-1]), 4) if len(vol) else 0
    avg_vol     = round(float(vol.mean()),   4) if len(vol) else 0
    max_vol     = round(float(vol.max()),    4) if len(vol) else 0
    min_vol     = round(float(vol.min()),    4) if len(vol) else 0
    
    overall_vol = round(float(df['Daily_Return'].std()), 4) if 'Daily_Return' in df.columns and len(df['Daily_Return'].dropna()) > 1 else 0

    annualised  = round(float(current_vol * 252**0.5), 4) if current_vol else 0

    if current_vol < 1.0:
        status = "LOW"
    elif current_vol < 2.5:
        status = "MODERATE"
    else:
        status = "HIGH"

    vol_series = df[['Date_str', 'Volatility_20']].dropna()
    top_vol    = vol_series.nlargest(5, 'Volatility_20')
    high_vol_dates = top_vol[['Date_str', 'Volatility_20']].rename(
        columns={'Volatility_20': 'volatility'}).to_dict('records')

    return {
        "current":     current_vol,
        "average":     avg_vol,
        "overall":     overall_vol,
        "maximum":     max_vol,
        "minimum":     min_vol,
        "annualised":  annualised,
        "status":      status,
        "high_vol_dates": high_vol_dates,
    }


# ──────────────────────────────────────────────────────────────
# 7. RETURN ANALYSIS
# ──────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────
# 6. VOLUME ANALYSIS
# ──────────────────────────────────────────────────────────────

def compute_volume_stats(df):
    vol = df['Volume'].dropna()
    avg_vol = float(vol.mean())
    idx_max = df['Volume'].idxmax()
    idx_min = df['Volume'].idxmin()

    threshold = avg_vol + 1.5 * float(vol.std())
    high_vol_days = df[df['Volume'] > threshold][['Date_str', 'Volume', 'Close']].to_dict('records')

    return {
        "average":         round(avg_vol, 0),
        "total":           round(float(vol.sum()), 0),
        "highest_volume":  round(float(df.loc[idx_max, 'Volume']), 0),
        "highest_date":    df.loc[idx_max, 'Date_str'],
        "lowest_volume":   round(float(df.loc[idx_min, 'Volume']), 0),
        "lowest_date":     df.loc[idx_min, 'Date_str'],
        "high_vol_days":   high_vol_days[:10],
    }

def compute_return_stats(df: pd.DataFrame) -> dict:
    """Compute return distribution statistics."""
    ret = df['Daily_Return'].dropna()

    # Histogram bins
    hist, bin_edges = np.histogram(ret, bins=30)
    bin_centers     = [(bin_edges[i] + bin_edges[i+1]) / 2 for i in range(len(bin_edges)-1)]

    idx_max = df['Daily_Return'].idxmax() if ret.max() == ret.max() else None
    idx_min = df['Daily_Return'].idxmin() if ret.min() == ret.min() else None

    pct_positive = round(float((ret > 0).sum() / len(ret) * 100), 2)
    pct_negative = round(float((ret < 0).sum() / len(ret) * 100), 2)
    within_2pct  = round(float((ret.abs() <= 2).sum() / len(ret) * 100), 2)

    return {
        "average":      round(float(ret.mean()), 4),
        "std":          round(float(ret.std()),  4),
        "max_gain":     round(float(ret.max()),  4),
        "max_gain_date":df.loc[idx_max, 'Date_str'] if idx_max is not None else "",
        "max_loss":     round(float(ret.min()),  4),
        "max_loss_date":df.loc[idx_min, 'Date_str'] if idx_min is not None else "",
        "pct_positive": pct_positive,
        "pct_negative": pct_negative,
        "within_2pct":  within_2pct,
        "histogram": {
            "counts":      hist.tolist(),
            "bin_centers": [round(b, 4) for b in bin_centers],
        },
    }


# ──────────────────────────────────────────────────────────────
# 8. AUTO INSIGHTS
# ──────────────────────────────────────────────────────────────

def generate_insights(df: pd.DataFrame, trend: dict, vol_stats: dict,
                       volume_stats: dict, return_stats: dict):
    """Generate data-driven insights from the dataset."""
    insights = []

    # Price change
    pct = trend.get("total_change_pct", 0)
    direction_word = "increased" if pct >= 0 else "decreased"
    insights.append({
        "icon": "trending-up" if pct >= 0 else "trending-down",
        "category": "Price Trend",
        "text": f"Closing prices {direction_word} by {abs(pct):.1f}% across the selected period.",
        "type":  "positive" if pct >= 0 else "negative",
    })

    # Average daily return
    avg_ret = return_stats.get("average", 0)
    insights.append({
        "icon": "percent",
        "category": "Returns",
        "text": f"Average daily return was {avg_ret:+.2f}%.",
        "type": "neutral",
    })

    # Positive vs negative days
    pct_pos = return_stats.get("pct_positive", 0)
    insights.append({
        "icon": "bar-chart-2",
        "category": "Returns",
        "text": f"{pct_pos:.1f}% of trading days recorded a positive return.",
        "type": "positive" if pct_pos > 50 else "neutral",
    })

    # Within ±2%
    w2 = return_stats.get("within_2pct", 0)
    insights.append({
        "icon": "activity",
        "category": "Returns",
        "text": f"{w2:.1f}% of daily returns stayed within ±2% — indicating relatively stable price movement.",
        "type": "neutral",
    })

    # Max positive day
    max_gain      = return_stats.get("max_gain", 0)
    max_gain_date = return_stats.get("max_gain_date", "")
    insights.append({
        "icon": "arrow-up-circle",
        "category": "Returns",
        "text": f"The strongest single-day gain was +{max_gain:.2f}% on {max_gain_date}.",
        "type": "positive",
    })

    # Max loss day
    max_loss      = return_stats.get("max_loss", 0)
    max_loss_date = return_stats.get("max_loss_date", "")
    insights.append({
        "icon": "arrow-down-circle",
        "category": "Returns",
        "text": f"The steepest single-day loss was {max_loss:.2f}% on {max_loss_date}.",
        "type": "negative",
    })

    # Volatility
    vol_status = vol_stats.get("status", "MODERATE")
    current_v  = vol_stats.get("current", 0)
    insights.append({
        "icon": "zap",
        "category": "Volatility",
        "text": f"Current rolling volatility is {current_v:.2f}% (20-day std of returns), classified as {vol_status}.",
        "type": {"LOW": "positive", "MODERATE": "neutral", "HIGH": "negative"}.get(vol_status, "neutral"),
    })

    # High volatility dates
    high_vol_dates = vol_stats.get("high_vol_dates", [])
    if high_vol_dates:
        hv = high_vol_dates[0]
        insights.append({
            "icon": "alert-triangle",
            "category": "Volatility",
            "text": f"The highest volatility period was around {hv['Date_str']} ({hv['volatility']:.2f}%).",
            "type": "negative",
        })

    # Volume
    highest_vol_date   = volume_stats.get("highest_date", "")
    highest_vol_amount = volume_stats.get("highest_volume", 0)
    insights.append({
        "icon": "layers",
        "category": "Volume",
        "text": f"Trading volume was highest on {highest_vol_date} ({highest_vol_amount:,.0f} shares).",
        "type": "neutral",
    })

    # Overall trend
    insights.append({
        "icon": "compass",
        "category": "Trend",
        "text": f"Overall price trend is {trend.get('direction', 'UNKNOWN')} with a trend strength of {trend.get('strength', 0):.1f}%.",
        "type": {"BULLISH": "positive", "BEARISH": "negative", "SIDEWAYS": "neutral"}.get(
            trend.get("direction", "SIDEWAYS"), "neutral"),
    })

    return insights


# ──────────────────────────────────────────────────────────────
# 9. CHART DATA HELPERS
# ──────────────────────────────────────────────────────────────

def _safe_float(v):
    """Convert a potentially NaN value to None for JSON."""
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(float(v), 4)


def build_price_chart_data(df: pd.DataFrame) -> dict:
    dates   = df['Date_str'].tolist()
    return {
        "dates":   dates,
        "open":    [_safe_float(v) for v in df['Open']],
        "high":    [_safe_float(v) for v in df['High']],
        "low":     [_safe_float(v) for v in df['Low']],
        "close":   [_safe_float(v) for v in df['Close']],
        "ma20":    [_safe_float(v) for v in df['MA_20']],
        "ma50":    [_safe_float(v) for v in df['MA_50']],
    }


def build_return_chart_data(df: pd.DataFrame) -> dict:
    return {
        "dates":   df['Date_str'].tolist(),
        "returns": [_safe_float(v) for v in df['Daily_Return']],
    }


def build_volatility_chart_data(df: pd.DataFrame) -> dict:
    return {
        "dates":      df['Date_str'].tolist(),
        "volatility": [_safe_float(v) for v in df['Volatility_20']],
    }


def build_volume_chart_data(df: pd.DataFrame) -> dict:
    return {
        "dates":  df['Date_str'].tolist(),
        "volume": [_safe_float(v) for v in df['Volume']],
        "close":  [_safe_float(v) for v in df['Close']],
    }


# ──────────────────────────────────────────────────────────────
# 10. MASTER PIPELINE
# ──────────────────────────────────────────────────────────────

def run_full_analysis(df_raw: pd.DataFrame) -> dict:
    # Normalize and validate
    val = normalize_stock_csv(df_raw)
    if not val["success"]:
        return {"success": False, "errors": val["errors"]}

    df = val["df"]
    quality_report = val["quality_report"]
    format_info = val["format_info"]

    if len(df) < 5:
        return {"success": False, "errors": ["Dataset is too small to analyse (fewer than 5 valid rows)."]}

    # Feature engineering
    df = add_features(df)

    # EDA computations
    trend        = compute_trend(df)
    vol_stats    = compute_volatility_stats(df)
    volume_stats = compute_volume_stats(df)
    return_stats = compute_return_stats(df)
    summary_stats= compute_summary_stats(df)
    corr_data    = compute_correlation(df)
    insights     = generate_insights(df, trend, vol_stats, volume_stats, return_stats)

    # Chart data
    price_chart  = build_price_chart_data(df)
    return_chart = build_return_chart_data(df)
    vol_chart    = build_volatility_chart_data(df)
    volume_chart = build_volume_chart_data(df)

    # Overview metrics
    overview = {
        "dataset_name": "Uploaded Dataset",
        "date_start":   df['Date_str'].iloc[0],
        "date_end":     df['Date_str'].iloc[-1],
        "total_rows":   len(df),
        "last_close":   round(float(df['Close'].iloc[-1]), 2),
        "all_time_high":round(float(df['High'].max()), 2),
        "all_time_low": round(float(df['Low'].min()),  2),
        "avg_return":   round(float(df['Daily_Return'].mean()), 4),
        "current_vol":  vol_stats["current"],
        "total_volume": volume_stats["total"],
    }

    # Table data (last 500 rows for performance)
    table_cols = ['Date_str','Open','High','Low','Close','Volume',
                  'Daily_Return','Price_Change','MA_20','MA_50','Volatility_20']
    table_df = df[[c for c in table_cols if c in df.columns]].tail(500)
    table_records = []
    for _, row in table_df.iterrows():
        rec = {}
        for c in table_df.columns:
            v = row[c]
            if pd.isna(v):
                rec[c] = None
            elif isinstance(v, float):
                rec[c] = round(v, 4)
            else:
                rec[c] = v
        table_records.append(rec)

    # Store cleaned df for download (pickle via session is not used; we write temp CSV)
    return {
        "success":       True,
        "quality_report":quality_report,
        "overview":      overview,
        "trend":         trend,
        "summary_stats": summary_stats,
        "correlation":   corr_data,
        "vol_stats":     vol_stats,
        "volume_stats":  volume_stats,
        "return_stats":  return_stats,
        "insights":      insights,
        "charts": {
            "price":      price_chart,
            "returns":    return_chart,
            "volatility": vol_chart,
            "volume":     volume_chart,
            "histogram":  return_stats["histogram"],
        },
        "table":         table_records,
        "df_cleaned":    df,  # removed before JSON serialisation in app.py
    }
