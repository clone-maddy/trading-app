import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { API } from '../config/api';

function Analytics({ mode = 'virtual' }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchHistory();
  }, [mode]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const endpoint = mode === 'real' ? '/positions/history' : '/virtual/history';
      const res = await axios.get(`${API}${endpoint}`, { headers });
      if (res.data.success) {
        setHistory(res.data.data);
      }
    } catch (error) {
      console.log('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app" style={{ textAlign: 'center', padding: '100px' }}>
        <h2>⏳ Loading performance analytics...</h2>
      </div>
    );
  }

  // Calculate statistics for Virtual mode (since we have round-trip closed trades in DB)
  let stats = {
    netPnL: 0,
    winRate: 0,
    profitFactor: 0,
    avgWin: 0,
    avgLoss: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    maxWin: 0,
    maxLoss: 0
  };

  let chartData = [];
  let pieData = [];

  if (mode === 'virtual' && history.length > 0) {
    // History is sorted reverse chronological, reverse it to draw cumulative curve
    const chronHistory = [...history].reverse();
    let runningPnL = 0;
    
    chartData = chronHistory.map((trade, idx) => {
      runningPnL += trade.pnl || 0;
      return {
        tradeIndex: idx + 1,
        symbol: trade.symbol,
        tradePnL: trade.pnl || 0,
        "Cumulative P&L": runningPnL
      };
    });

    const wins = history.filter(t => t.pnl >= 0);
    const losses = history.filter(t => t.pnl < 0);
    const totalTrades = history.length;
    const winsSum = wins.reduce((sum, t) => sum + t.pnl, 0);
    const lossesSum = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    stats = {
      netPnL: runningPnL,
      winRate: totalTrades > 0 ? ((wins.length / totalTrades) * 100).toFixed(1) : 0,
      profitFactor: lossesSum > 0 ? (winsSum / lossesSum).toFixed(2) : winsSum > 0 ? '∞' : '0.00',
      avgWin: wins.length > 0 ? (winsSum / wins.length) : 0,
      avgLoss: losses.length > 0 ? (lossesSum / losses.length) : 0,
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      maxWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
      maxLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0
    };

    pieData = [
      { name: 'Winning Trades', value: stats.wins, color: '#00c853' },
      { name: 'Losing Trades', value: stats.losses, color: '#ff1744' }
    ];
  }

  // Real mode metrics based on executions
  const totalExecutions = history.length;
  const buyCount = history.filter(t => t.side === 'BUY').length;
  const sellCount = history.filter(t => t.side === 'SELL').length;

  const barData = [
    { name: 'BUY Orders', count: buyCount, fill: '#00c853' },
    { name: 'SELL Orders', count: sellCount, fill: '#ff1744' }
  ];

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>📈 {mode === 'real' ? 'Real Account' : 'Virtual Demo'} Analytics</h1>
          <p className="subtitle">Visual performance report and equity statistics</p>
        </div>
      </div>

      {mode === 'virtual' ? (
        history.length === 0 ? (
          <div className="positions-card" style={{ textAlign: 'center', padding: '60px' }}>
            <h3>No trade data available to display graphs!</h3>
            <p style={{ color: '#aaa', marginTop: '10px' }}>Place and close some virtual trades to see analytics.</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="stats-grid" style={{ marginBottom: '30px' }}>
              <div className="stat-card">
                <p>📊 Net Realized P&L</p>
                <h2 className={stats.netPnL >= 0 ? 'profit' : 'loss'}>
                  ₹{stats.netPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
              </div>
              <div className="stat-card">
                <p>🎯 Win Rate</p>
                <h2>{stats.winRate}%</h2>
              </div>
              <div className="stat-card">
                <p>🔗 Profit Factor</p>
                <h2>{stats.profitFactor}</h2>
              </div>
              <div className="stat-card">
                <p>📈 Avg Winning Trade</p>
                <h2 className="profit">₹{stats.avgWin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h2>
              </div>
              <div className="stat-card">
                <p>📉 Avg Losing Trade</p>
                <h2 className="loss">-₹{stats.avgLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h2>
              </div>
              <div className="stat-card">
                <p>📋 Closed Trades</p>
                <h2>{stats.totalTrades}</h2>
              </div>
              <div className="stat-card">
                <p>🟢 Max Win</p>
                <h2 className="profit">₹{stats.maxWin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h2>
              </div>
              <div className="stat-card">
                <p>🔴 Max Loss</p>
                <h2 className="loss">₹{stats.maxLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h2>
              </div>
            </div>

            {/* Graphs Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px', marginBottom: '30px' }}>
              
              {/* Equity Curve */}
              <div className="settings-card" style={{ padding: '20px' }}>
                <h3 style={{ marginBottom: '15px' }}>📈 Portfolio Equity Curve</h3>
                <div style={{ width: '100%', height: '300px' }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3d" />
                      <XAxis dataKey="tradeIndex" label={{ value: 'Trade #', position: 'insideBottomRight', offset: -10 }} stroke="#aaa" />
                      <YAxis stroke="#aaa" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#2a2a3d', color: '#fff' }}
                        formatter={(value, name, props) => [`₹${value.toFixed(2)}`, 'PnL']}
                      />
                      <Line type="monotone" dataKey="Cumulative P&L" stroke="#00d4ff" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Win/Loss Pie Chart */}
              <div className="settings-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h3 style={{ marginBottom: '15px', alignSelf: 'flex-start' }}>🎯 Win/Loss Breakdown</h3>
                <div style={{ width: '100%', height: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <ResponsiveContainer width="80%" height="80%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#2a2a3d', color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ marginLeft: '20px', textAlign: 'left' }}>
                    <p style={{ color: '#00c853', fontWeight: 'bold' }}>🟢 Wins: {stats.wins} trades</p>
                    <p style={{ color: '#ff1744', fontWeight: 'bold', marginTop: '10px' }}>🔴 Losses: {stats.losses} trades</p>
                  </div>
                </div>
              </div>

            </div>
          </>
        )
      ) : (
        // Real Mode Analytics
        history.length === 0 ? (
          <div className="positions-card" style={{ textAlign: 'center', padding: '60px' }}>
            <h3>No real executions recorded for today!</h3>
            <p style={{ color: '#aaa', marginTop: '10px' }}>Execute some orders on your AngelOne account to see order log metrics.</p>
          </div>
        ) : (
          <>
            <div className="stats-grid" style={{ marginBottom: '30px' }}>
              <div className="stat-card">
                <p>⚡ Total Executed Orders</p>
                <h2>{totalExecutions}</h2>
              </div>
              <div className="stat-card">
                <p>🛒 BUY Orders</p>
                <h2 className="profit">{buyCount}</h2>
              </div>
              <div className="stat-card">
                <p>📤 SELL Orders</p>
                <h2 className="loss">{sellCount}</h2>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px', marginBottom: '30px' }}>
              {/* Executions Bar Chart */}
              <div className="settings-card" style={{ padding: '20px' }}>
                <h3 style={{ marginBottom: '15px' }}>📊 Order Type Frequency</h3>
                <div style={{ width: '100%', height: '300px' }}>
                  <ResponsiveContainer>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3d" />
                      <XAxis dataKey="name" stroke="#aaa" />
                      <YAxis stroke="#aaa" />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', borderColor: '#2a2a3d', color: '#fff' }} />
                      <Bar dataKey="count" fill="#7b2ff7">
                        {barData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Execution List */}
              <div className="settings-card" style={{ padding: '20px', maxHeight: '350px', overflowY: 'auto' }}>
                <h3 style={{ marginBottom: '15px' }}>📋 Today's Executions Log</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {history.map((exec, idx) => (
                    <div key={idx} style={{ padding: '12px', background: '#0f0f1a', borderRadius: '8px', borderLeft: `4px solid ${exec.side === 'BUY' ? '#00c853' : '#ff1744'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{exec.symbol}</strong>
                        <span style={{ color: '#aaa', fontSize: '12px' }}>{new Date(exec.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '14px' }}>
                        <span>Side: <strong style={{ color: exec.side === 'BUY' ? '#00c853' : '#ff1744' }}>{exec.side}</strong></span>
                        <span>Price: ₹{exec.buyPrice}</span>
                        <span>Qty: {exec.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}

export default Analytics;
