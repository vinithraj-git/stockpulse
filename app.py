"""
STOCKPULSE — Flask Application
Market Intelligence Lab for Stock Price Trend & Volatility Analysis
"""

import os
import json
import uuid
import io
import pandas as pd
from flask import (Flask, render_template, request, jsonify,
                   send_file, session)
from analysis.eda import run_full_analysis

# ─────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "stockpulse-secret-2024")

UPLOAD_FOLDER  = os.path.join(os.path.dirname(__file__), 'uploads')
DATA_FOLDER    = os.path.join(os.path.dirname(__file__), 'data')
SAMPLE_CSV     = os.path.join(DATA_FOLDER, 'sample_stock_data.csv')
MAX_FILE_SIZE  = 10 * 1024 * 1024   # 10 MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# In-memory store for the processed DataFrames (keyed by session token)
_df_store: dict[str, pd.DataFrame] = {}


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _get_session_token() -> str:
    if 'token' not in session:
        session['token'] = str(uuid.uuid4())
    return session['token']


def _store_df(token: str, df: pd.DataFrame):
    _df_store[token] = df


def _load_df(token: str) -> pd.DataFrame | None:
    return _df_store.get(token)


def _analysis_to_json(result: dict) -> dict:
    """Remove the raw DataFrame before JSON serialisation."""
    out = {k: v for k, v in result.items() if k != 'df_cleaned'}
    return out


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/sample', methods=['GET'])
def sample():
    """Load and analyse the bundled sample dataset."""
    try:
        df_raw = pd.read_csv(SAMPLE_CSV)
        result = run_full_analysis(df_raw)

        if not result['success']:
            return jsonify(result), 400

        # Tag it as the demo dataset
        result['overview']['dataset_name'] = 'Demo Dataset — STOCKPULSE Sample'

        token = _get_session_token()
        _store_df(token, result.pop('df_cleaned'))

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"success": False, "errors": [f"Server error: {str(e)}"]}), 500


@app.route('/upload', methods=['POST'])
def upload():
    """Receive a user-uploaded CSV, validate and analyse it."""
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "errors": ["No file was included in the request."]}), 400

        f = request.files['file']

        if not f.filename:
            return jsonify({"success": False, "errors": ["No file was selected."]}), 400

        if not f.filename.lower().endswith('.csv'):
            return jsonify({"success": False, "errors": [
                "Invalid file type. Please upload a CSV file (.csv)."]}), 400

        # Read into memory (avoid disk I/O for security)
        content = f.read()

        if len(content) == 0:
            return jsonify({"success": False, "errors": ["The uploaded file is empty."]}), 400

        if len(content) > MAX_FILE_SIZE:
            return jsonify({"success": False, "errors": [
                "File is too large. Maximum allowed size is 10 MB."]}), 400

        try:
            df_raw = pd.read_csv(io.StringIO(content.decode('utf-8')))
        except UnicodeDecodeError:
            try:
                df_raw = pd.read_csv(io.StringIO(content.decode('latin-1')))
            except Exception:
                return jsonify({"success": False, "errors": [
                    "Could not read the file. Please ensure it is a valid UTF-8 or Latin-1 encoded CSV."]}), 400
        except Exception as e:
            return jsonify({"success": False, "errors": [
                f"Could not parse the CSV file: {str(e)}"]}), 400

        result = run_full_analysis(df_raw)

        if not result['success']:
            return jsonify(result), 400

        # Use uploaded filename (without extension) as dataset name
        dataset_name = os.path.splitext(f.filename)[0].replace('_', ' ').replace('-', ' ').title()
        result['overview']['dataset_name'] = dataset_name

        token = _get_session_token()
        _store_df(token, result.pop('df_cleaned'))

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"success": False, "errors": [f"Server error: {str(e)}"]}), 500


@app.route('/download', methods=['GET'])
def download():
    """Return the processed CSV as a downloadable file."""
    try:
        token = session.get('token')
        df    = _load_df(token) if token else None

        if df is None:
            return jsonify({"error": "No dataset loaded. Please upload or load a dataset first."}), 400

        # Build output CSV
        out_cols = ['Date_str','Open','High','Low','Close','Volume',
                    'Daily_Return','Price_Change','MA_20','MA_50','Volatility_20']
        out_df   = df[[c for c in out_cols if c in df.columns]].copy()
        out_df.rename(columns={
            'Date_str': 'Date',
            'Daily_Return': 'Daily Return',
            'Price_Change': 'Price Change',
            'MA_20': '20D MA',
            'MA_50': '50D MA',
            'Volatility_20': 'Volatility'
        }, inplace=True)

        buf = io.StringIO()
        out_df.to_csv(buf, index=False)
        buf.seek(0)

        return send_file(
            io.BytesIO(buf.getvalue().encode('utf-8')),
            mimetype='text/csv',
            as_attachment=True,
            download_name='stockpulse_processed_data.csv',
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "app": "STOCKPULSE"}), 200


# ─────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 50)
    print("  STOCKPULSE — Market Intelligence Lab")
    print("  http://127.0.0.1:5000")
    print("=" * 50)
    app.run(debug=True, host='0.0.0.0', port=5000)
