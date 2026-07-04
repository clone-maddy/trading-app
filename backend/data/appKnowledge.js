const appKnowledge = `
=========================================
CHANAKYA TRADING PLATFORM DOCUMENTATION
=========================================

App Branding & Logo:
- Name: Chanakya
- Purpose: A systematic derivatives (options) tracking and strategic companion app.

Workspace Options:
- Landing Page (/): Highlights capabilities (Market Analysis, Alerts, risk controls, practice paper trading, real brokers, charts).
- Dashboard: Track open options positions, total profits/losses, active safeguards, and trade execution logs.
- Option Chain: Matrix showing strike prices, Call/Put last traded prices (LTP), Volumes, and Open Interest. It aggregates Open Interest across 7 strikes (3 strikes above ATM, 1 ATM strike, and 3 strikes below ATM) to display Put-Call Ratio (PCR) indicators.
- Alerts Center: View triggered moving average crossovers and config.
- Account Settings: Update profile, default mode, Telegram Chat ID, and AngelOne broker configurations.

Key Features & Logic:
1. Multi-Mode Environment:
   - Real Mode: Integrates with AngelOne broker using client credentials (Client Code, API Key, MPIN, TOTP). Sends real order requests directly to Nifty/Banknifty/Finnifty derivatives contracts.
   - Virtual Mode (Paper Trading): Sandbox simulation using real-time price tick feeds. Users practice strategy executions safely with virtual balances.

2. Crossover Alerts Engine:
   - Server-side tracker continually calculates 9 EMA (Exponential Moving Average) and 21 EMA from 1-minute historical candlestick feeds.
   - Triggers a bullish signal when 9 EMA crosses above 21 EMA.
   - Triggers a bearish signal when 9 EMA crosses below 21 EMA.
   - Features a 1-minute safety lock (lockout) preventing duplicate triggers from minor noise spikes.
   - Alerts dispatch immediately as push notifications to your linked Telegram app.

3. Telegram Integration:
   - Retransmits crossover and exit triggers instantly to the user's phone via a Telegram Bot.
   - Configured by retrieving the numeric Chat ID from Telegram (@userinfobot) and saving it in Chanakya's Account Settings.

4. Automated Risk Safeguards:
   - Global Targets: Stops monitoring and squares-off active positions once total P&L hits target profits.
   - Stop Loss (SL): Squares-off positions if losses hit thresholds. Supports Trailing Stop Losses that step up thresholds as profits climb.
   - Partial Exits: Automatically scales out of positions (e.g. exiting 50% quantities) once specified partial milestones are reached.
`;

module.exports = appKnowledge;
