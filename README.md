# STOCKPULSE — Market Intelligence Lab
### Stock Price Trend & Volatility Analysis · EDA Mini Project

---

## Project Objective

STOCKPULSE is an interactive web application that performs **Exploratory Data Analysis (EDA)** on historical stock market data supplied as CSV files. It transforms raw OHLCV data into rich, interactive visualisations covering price trends, daily returns, volatility, trading volume, and variable correlations — all without a database.

---

## Features

| Feature | Description |
|---|---|
| Sample Dataset | Bundled demo data — works instantly without uploading |
| CSV Upload | Drag-and-drop or browse file selector |
| CSV Validation | Checks required columns, data types, empty files |
| Data Cleaning | Removes duplicates, handles missing values, parses dates |
| Statistical Analysis | Count, mean, median, std, min, max, quartiles |
| Price Trend | Closing price chart with Open/High/Low toggles |
| Moving Averages | 20-day and 50-day rolling mean overlays |
| Time Range Filters | 1W / 1M / 3M / 6M / 1Y / ALL |
| Daily Returns | Bar chart + frequency histogram |
| Volatility Analysis | 20-day rolling volatility chart with status classification |
| Annualised Volatility | Current vol × √252 |
| Volume Analysis | Bar chart + Price vs Volume dual-axis comparison |
| Correlation Heatmap | Canvas-rendered diverging colour heatmap |
| Auto Insights | 10+ data-driven textual insights |
| Data Explorer | Searchable, sortable, paginated table |
| Download | Processed CSV with all derived columns |
| Responsive Design | Desktop · Laptop · Tablet · Mobile |

---

## Technology Stack

**Backend**
- Python 3.10+
- Flask 3.x
- Pandas 2.x
- NumPy 1.26+

**Frontend**
- HTML5 · CSS3 · Vanilla JavaScript (ES2020)
- Chart.js 4.x (via CDN)
- Google Fonts — Inter + JetBrains Mono

**No database required.** All processing happens in-memory from CSV files.

---

## Project Structure

```
stockpulse/
│
├── app.py                     # Flask routes & server
├── requirements.txt           # Python dependencies
├── README.md
│
├── data/
│   └── sample_stock_data.csv  # Bundled 252-row demo dataset
│
├── analysis/
│   └── eda.py                 # All EDA logic (clean, compute, chart data)
│
├── templates/
│   └── index.html             # Single-page application template
│
├── static/
│   ├── css/
│   │   └── style.css          # Market Intelligence Lab design system
│   └── js/
│       └── app.js             # Frontend — charts, table, upload logic
│
└── uploads/                   # (empty — files are processed in-memory)
```

---

## CSV Format

Your CSV must contain these **six columns** (case-insensitive):

```csv
Date,Open,High,Low,Close,Volume
2024-01-02,1820.50,1845.30,1812.20,1838.75,2450000
2024-01-03,1838.75,1862.40,1825.10,1855.20,2180000
```

| Column | Type | Description |
|---|---|---|
| Date | YYYY-MM-DD | Trading date |
| Open | Numeric | Opening price |
| High | Numeric | Day's highest price |
| Low | Numeric | Day's lowest price |
| Close | Numeric | Closing price |
| Volume | Numeric | Shares traded |

---

## Installation

### 1. Clone / Download the project

```bash
# Navigate to the project folder
cd stockpulse
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

### 3. Activate the virtual environment

**Windows (PowerShell):**
```powershell
venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```cmd
venv\Scripts\activate.bat
```

**macOS / Linux:**
```bash
source venv/bin/activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Run the application

```bash
python app.py
```

Open your browser and go to: **http://127.0.0.1:5000**

---

## How to Use

1. **Landing Page** — choose **"Explore Sample Dataset"** or **upload your own CSV**.
2. **Upload Flow** — drag your `.csv` onto the drop zone or click to browse. The file is validated, cleaned, and analysed on the server.
3. **Dashboard** — once loaded, the dashboard appears with all sections.
4. **Navigation** — use the floating top navigation bar to jump between sections.
5. **Charts** — toggle fields, switch time ranges, hover for tooltips.
6. **Data Explorer** — search, sort, paginate the processed table.
7. **Download** — click *"Download Processed CSV"* to get the cleaned data with all derived columns.

---

## EDA Calculations

| Calculation | Formula / Method |
|---|---|
| Price Change | `Close.diff()` — absolute change from previous day |
| Daily Return (%) | `Close.pct_change() * 100` |
| 20-Day Moving Average | `Close.rolling(20).mean()` |
| 50-Day Moving Average | `Close.rolling(50).mean()` |
| Rolling Volatility | `Daily_Return.rolling(20).std()` |
| Annualised Volatility | `Current_Vol × √252` |
| Trend Direction | Linear regression on Close; total % change > 5% = BULLISH |
| Trend Strength | R² of linear regression |
| Correlation Matrix | `df[cols].corr()` — Pearson correlation |

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/` | GET | Landing / Dashboard page |
| `/sample` | GET | Load and analyse bundled sample data |
| `/upload` | POST | Receive, validate, and analyse uploaded CSV |
| `/download` | GET | Download the processed CSV |
| `/health` | GET | Health check endpoint |

---

## Screenshots

> *(Add screenshots here after running the application)*

- Landing Page — hero + drag-and-drop zone
- Dashboard Overview — metric cards + pipeline banner
- Price Chart — interactive line chart with MA overlays
- Return Distribution — bar + histogram
- Volatility Lab — rolling volatility chart
- Correlation Heatmap — canvas heatmap
- Data Explorer — sortable paginated table

---

## Future Enhancements

- [ ] Multiple stock comparison (overlay two tickers)
- [ ] Bollinger Bands overlay
- [ ] RSI / MACD technical indicators
- [ ] Date range picker on dashboard
- [ ] Export charts as PNG
- [ ] Summary PDF report generation
- [ ] Candlestick chart support

---

## Disclaimer

This application is built for **educational purposes** as part of a college EDA mini project.
It does **not** provide financial advice, trading signals, or investment recommendations.
The sample data is synthetic and does not represent real market prices.

---

*Built with Python Flask · Pandas · NumPy · Chart.js*
