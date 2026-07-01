import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { io } from 'socket.io-client';
import StockChart from '../components/StockChart';

const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const INDEX_TOKENS = {
  'NIFTY': '99926000',
  'BANKNIFTY': '99926009',
  'FINNIFTY': '99926037'
};

function VirtualTrading() {
  const [selectedIndex, setSelectedIndex] = useState('NIFTY');
  const [expiries, setExpiries] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [optionChain, setOptionChain] = useState([]);
  const [spotPrice, setSpotPrice] = useState(0);
  const [activeChart, setActiveChart] = useState(null);
  const [loadingChain, setLoadingChain] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const [tradeModal, setTradeModal] = useState(null);
  const [quantity, setQuantity] = useState(1);

  const socketRef = useRef(null);
  const subscribedTokensRef = useRef([]);
  const [flashingCells, setFlashingCells] = useState(new Set());
  const atmRef = useRef(null);
  const hasScrolledRef = useRef(false);

  const selectedIndexRef = useRef(selectedIndex);
  const optionChainRef = useRef(optionChain);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    optionChainRef.current = optionChain;
  }, [optionChain]);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Reset scroll flag when changing parameters
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [selectedIndex, selectedExpiry]);

  // Scroll to ATM strike only on initial load
  useEffect(() => {
    if (optionChain.length > 0 && atmRef.current && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      setTimeout(() => {
        if (atmRef.current) {
          atmRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 400);
    }
  }, [optionChain]);

  // Connect Socket.IO on mount
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsLive(true);
      if (optionChainRef.current.length > 0) {
        const newTokens = [];
        optionChainRef.current.forEach(row => {
          if (row.ce?.token) newTokens.push(row.ce.token);
          if (row.pe?.token) newTokens.push(row.pe.token);
        });
        const indexToken = INDEX_TOKENS[selectedIndexRef.current];
        if (indexToken) {
          newTokens.push(indexToken);
        }
        subscribedTokensRef.current = newTokens;
        socket.emit('subscribe-tokens', { tokens: newTokens });
      }
    });

    socket.on('disconnect', () => {
      setIsLive(false);
    });

    // Listen for price updates
    socket.on('price-update', (data) => {
      if (!data || !data.token || !data.ltp) return;

      // Handle index spot price ticks
      if (data.token === INDEX_TOKENS[selectedIndexRef.current]) {
        setSpotPrice(data.ltp);
        return;
      }

      let type = '';
      setOptionChain(prev => {
        return prev.map(row => {
          const newRow = { ...row };
          if (row.ce && row.ce.token === data.token) {
            newRow.ce = { ...row.ce, ...data };
            type = 'ce';
          }
          if (row.pe && row.pe.token === data.token) {
            newRow.pe = { ...row.pe, ...data };
            type = 'pe';
          }
          return newRow;
        });
      });

      if (type) {
        const cellId = `${type}-${data.token}`;
        setFlashingCells(prev => {
          const next = new Set(prev);
          next.add(cellId);
          return next;
        });
        setTimeout(() => {
          setFlashingCells(prev => {
            const next = new Set(prev);
            next.delete(cellId);
            return next;
          });
        }, 500);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch expiries when selected index changes
  useEffect(() => {
    fetchExpiries(selectedIndex);
  }, [selectedIndex]);

  // Load option chain once expiry is loaded
  useEffect(() => {
    if (selectedExpiry) {
      fetchOptionChain();
    }
  }, [selectedExpiry]);

  const fetchExpiries = async (index) => {
    try {
      const res = await axios.get(`${API}/options/expiry/${index}`, { headers });
      if (res.data.success) {
        setExpiries(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedExpiry(res.data.data[0]);
        }
      }
    } catch (error) {
      console.log('Error fetching expiries:', error);
    }
  };

  const fetchOptionChain = async () => {
    if (!selectedExpiry) return;
    setLoadingChain(true);
    try {
      const res = await axios.get(`${API}/options/chain/${selectedIndex}/${selectedExpiry}`, { headers });
      if (res.data.success) {
        const allStrikes = res.data.data;
        const spot = res.data.spotPrice || 0;
        setSpotPrice(spot);

        // Filter strikes to show +/- 10 around the spot price
        let filteredChain = allStrikes;
        if (spot > 0) {
          const closestIndex = allStrikes.reduce((closest, curr, index) => {
            const currDiff = Math.abs(curr.strike - spot);
            const closestDiff = Math.abs(allStrikes[closest].strike - spot);
            return currDiff < closestDiff ? index : closest;
          }, 0);
          const start = Math.max(0, closestIndex - 10);
          const end = Math.min(allStrikes.length, closestIndex + 10);
          filteredChain = allStrikes.slice(start, end);
        } else {
          filteredChain = allStrikes.slice(0, 20);
        }

        setOptionChain(filteredChain);

        // Subscribe to socket tokens
        if (socketRef.current?.connected) {
          if (subscribedTokensRef.current.length > 0) {
            socketRef.current.emit('unsubscribe-tokens', { tokens: subscribedTokensRef.current });
          }

          const newTokens = [];
          filteredChain.forEach(row => {
            if (row.ce?.token) newTokens.push(row.ce.token);
            if (row.pe?.token) newTokens.push(row.pe.token);
          });

          const indexToken = INDEX_TOKENS[selectedIndex];
          if (indexToken) {
            newTokens.push(indexToken);
          }

          subscribedTokensRef.current = newTokens;
          socketRef.current.emit('subscribe-tokens', { tokens: newTokens });
        }
      }
    } catch (error) {
      toast.error('Error fetching option chain!');
    }
    setLoadingChain(false);
  };

  const openTradeModal = (option, type, side) => {
    setTradeModal({ ...option, optionType: type, side });
    setQuantity(1);
  };

  const placeTrade = async () => {
    if (!tradeModal) return;
    try {
      const totalQty = quantity * tradeModal.lotSize;
      const res = await axios.post(`${API}/virtual/trade`, {
        symbol: tradeModal.symbol,
        quantity: totalQty,
        buyPrice: tradeModal.ltp,
        type: tradeModal.optionType,
        side: tradeModal.side,
        token: tradeModal.token
      }, { headers });

      if (res.data.success) {
        toast.success(`Virtual trade executed: ${tradeModal.side} ${totalQty} units of ${tradeModal.symbol}!`);
        setTradeModal(null);
      } else {
        toast.error(res.data.message || 'Execution failed!');
      }
    } catch (error) {
      toast.error('Error placing virtual trade!');
    }
  };

  // Find ATM strike closest to spot price
  const isAtmStrike = (strike) => {
    if (!spotPrice || optionChain.length === 0) return false;
    const closest = optionChain.reduce((prev, curr) => {
      return Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? curr : prev;
    });
    return strike === closest.strike;
  };

  // Compute OI Summary for 3 Above ATM and 3 Below ATM
  const getOiSummary = () => {
    if (optionChain.length === 0 || !spotPrice) return null;
    
    const atmIndex = optionChain.reduce((closestIdx, curr, index) => {
      const currDiff = Math.abs(curr.strike - spotPrice);
      const closestDiff = Math.abs(optionChain[closestIdx].strike - spotPrice);
      return currDiff < closestDiff ? index : closestIdx;
    }, 0);

    let ceAbove = 0;
    let peAbove = 0;
    for (let i = 1; i <= 3; i++) {
      const row = optionChain[atmIndex + i];
      if (row) {
        ceAbove += Number(row.ce?.oi || 0);
        peAbove += Number(row.pe?.oi || 0);
      }
    }

    let ceBelow = 0;
    let peBelow = 0;
    for (let i = 1; i <= 3; i++) {
      const row = optionChain[atmIndex - i];
      if (row) {
        ceBelow += Number(row.ce?.oi || 0);
        peBelow += Number(row.pe?.oi || 0);
      }
    }

    return { ceAbove, ceBelow, peAbove, peBelow };
  };

  const oiSummary = getOiSummary();

  return (
    <div className="app">
      <Toaster position="top-right" />

      <div className="header">
        <div>
          <h1>🎮 Virtual Option Chain</h1>
          <p className="subtitle">Practice and test paper strategies safely</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span className={`live-badge ${isLive ? 'active' : ''}`}>
            {isLive ? '🟢 LIVE' : '⚪ OFFLINE'}
          </span>
        </div>
      </div>

      {/* Option Chain Controls */}
      <div className="option-chain-card">
        <div className="chain-controls">
          <div className="input-group">
            <label>Index</label>
            <select value={selectedIndex} onChange={(e) => setSelectedIndex(e.target.value)}>
              <option value="NIFTY">NIFTY</option>
              <option value="BANKNIFTY">BANKNIFTY</option>
              <option value="FINNIFTY">FINNIFTY</option>
            </select>
          </div>
          <div className="input-group">
            <label>Expiry</label>
            <select value={selectedExpiry} onChange={(e) => setSelectedExpiry(e.target.value)}>
              {expiries.map(exp => (
                <option key={exp} value={exp}>{exp}</option>
              ))}
            </select>
          </div>
          <button className="btn-load" onClick={fetchOptionChain} disabled={loadingChain}>
            {loadingChain ? '⏳ Loading...' : '🔄 Load Chain'}
          </button>
        </div>

        {spotPrice > 0 && (
          <div className="spot-price-banner" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              ⚡ {selectedIndex} Index Spot: <strong style={{ color: '#00d4ff', fontSize: '18px' }}>₹{spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <button
              onClick={() => setActiveChart({
                token: INDEX_TOKENS[selectedIndex],
                symbol: `${selectedIndex} INDEX`,
                exchange: 'NSE'
              })}
              style={{
                padding: '6px 12px',
                background: '#0ea5e9',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              📊 View Spot Chart
            </button>
          </div>
        )}

        {spotPrice > 0 && oiSummary && (
          <div className="oi-summary-container" style={{ display: 'flex', gap: '16px', marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', justifyContent: 'space-around' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', display: 'block', textTransform: 'uppercase', marginBottom: '4px' }}>CE Call Resistance (3 Strikes Above ATM)</span>
              <strong style={{ fontSize: '16px', color: '#b91c1c' }}>{oiSummary.ceAbove.toLocaleString('en-IN')}</strong>
            </div>
            <div style={{ width: '1px', background: '#cbd5e1' }}></div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', display: 'block', textTransform: 'uppercase', marginBottom: '4px' }}>PE Put Support (3 Strikes Below ATM)</span>
              <strong style={{ fontSize: '16px', color: '#047857' }}>{oiSummary.peBelow.toLocaleString('en-IN')}</strong>
            </div>
          </div>
        )}

        {optionChain.length > 0 && (
          <div className="chain-table-wrapper">
            <table className="chain-table">
              <thead>
                <tr>
                  <th colSpan="3" className="ce-header" style={{ textAlign: 'center', background: '#e8f5e9', color: '#2e7d32' }}>CALL (CE)</th>
                  <th className="strike-header" style={{ textAlign: 'center', background: '#f5f5f5', color: '#616161' }}>STRIKE</th>
                  <th colSpan="3" className="pe-header" style={{ textAlign: 'center', background: '#ffebee', color: '#c62828' }}>PUT (PE)</th>
                </tr>
                <tr>
                  <th>OI</th>
                  <th>Volume</th>
                  <th>LTP</th>
                  <th></th>
                  <th>LTP</th>
                  <th>Volume</th>
                  <th>OI</th>
                </tr>
              </thead>
              <tbody>
                {optionChain.map((row, index) => {
                  const atm = isAtmStrike(row.strike);
                  return (
                    <tr key={index} className={atm ? 'atm-row' : ''} ref={atm ? atmRef : null}>
                      {/* CALL CE SIDE */}
                      <td>{row.ce?.oi ? Number(row.ce.oi).toLocaleString('en-IN') : '-'}</td>
                      <td>{row.ce?.volume ? Number(row.ce.volume).toLocaleString('en-IN') : '-'}</td>
                      <td className={`clickable-cell buy-trigger ce-ltp ${flashingCells.has(`ce-${row.ce?.token}`) ? 'price-flash' : ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span style={{ flex: 1, paddingRight: '8px' }} onClick={() => row.ce && openTradeModal(row.ce, 'CE', 'BUY')}>
                            {row.ce?.ltp ? `₹${Number(row.ce.ltp).toFixed(2)}` : '-'}
                          </span>
                          {row.ce && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveChart({
                                  token: row.ce.token,
                                  symbol: row.ce.symbol,
                                  exchange: 'NFO'
                                });
                              }}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', fontSize: '13px' }}
                              title="View Chart"
                            >
                              📊
                            </button>
                          )}
                        </div>
                      </td>

                      {/* STRIKE MIDDLE */}
                      <td className={`strike-price ${atm ? 'atm-badge' : ''}`}>
                        {row.strike.toLocaleString()}
                        {atm && <span className="atm-tag">ATM</span>}
                      </td>

                      {/* PUT PE SIDE */}
                      <td className={`clickable-cell buy-trigger pe-ltp ${flashingCells.has(`pe-${row.pe?.token}`) ? 'price-flash' : ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span style={{ flex: 1, paddingRight: '8px' }} onClick={() => row.pe && openTradeModal(row.pe, 'PE', 'BUY')}>
                            {row.pe?.ltp ? `₹${Number(row.pe.ltp).toFixed(2)}` : '-'}
                          </span>
                          {row.pe && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveChart({
                                  token: row.pe.token,
                                  symbol: row.pe.symbol,
                                  exchange: 'NFO'
                                });
                              }}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', fontSize: '13px' }}
                              title="View Chart"
                            >
                              📊
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{row.pe?.volume ? Number(row.pe.volume).toLocaleString('en-IN') : '-'}</td>
                      <td>{row.pe?.oi ? Number(row.pe.oi).toLocaleString('en-IN') : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {optionChain.length === 0 && !loadingChain && (
          <p className="no-data">Select index and expiry, then click Load Chain!</p>
        )}
      </div>

      {/* Trade Modal */}
      {tradeModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{tradeModal.side === 'BUY' ? '🛒 Buy Option (Virtual)' : '📤 Sell Option (Virtual)'}</h2>
            
            {/* BUY / SELL Switch Toggle inside modal */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button 
                type="button"
                onClick={() => setTradeModal(prev => ({ ...prev, side: 'BUY' }))}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #10b981',
                  background: tradeModal.side === 'BUY' ? '#10b981' : '#ffffff',
                  color: tradeModal.side === 'BUY' ? '#ffffff' : '#10b981',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                BUY
              </button>
              <button 
                type="button"
                onClick={() => setTradeModal(prev => ({ ...prev, side: 'SELL' }))}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #ef4444',
                  background: tradeModal.side === 'SELL' ? '#ef4444' : '#ffffff',
                  color: tradeModal.side === 'SELL' ? '#ffffff' : '#ef4444',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                SELL
              </button>
            </div>

            <div className="modal-details">
              <p><span>Symbol:</span> {tradeModal.symbol}</p>
              <p><span>Type:</span> <span className={`type-badge ${tradeModal.optionType === 'CE' ? 'ce' : 'pe'}`}>{tradeModal.optionType}</span></p>
              <p><span>LTP:</span> ₹{tradeModal.ltp}</p>
              <p><span>Lot Size:</span> {tradeModal.lotSize}</p>
            </div>
            <div className="input-group">
              <label>Number of Lots</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
            <div className="modal-cost">
              <p>Total Quantity: {quantity * tradeModal.lotSize}</p>
              {tradeModal.side === 'BUY' ? (
                <p>Total Cost: ₹{(quantity * tradeModal.lotSize * tradeModal.ltp).toLocaleString('en-IN')}</p>
              ) : (
                <p>Premium Received: ₹{(quantity * tradeModal.lotSize * tradeModal.ltp).toLocaleString('en-IN')}</p>
              )}
            </div>
            <div className="modal-buttons">
              <button
                className={tradeModal.side === 'BUY' ? 'btn-buy' : 'btn-sell'}
                onClick={placeTrade}
              >
                {tradeModal.side === 'BUY' ? '✅ Confirm Buy' : '✅ Confirm Sell'}
              </button>
              <button className="btn-cancel" onClick={() => setTradeModal(null)}>❌ Cancel</button>
            </div>
          </div>
        </div>
      )}
      {activeChart && (
        <StockChart
          token={activeChart.token}
          symbol={activeChart.symbol}
          exchange={activeChart.exchange}
          onClose={() => setActiveChart(null)}
        />
      )}
    </div>
  );
}

export default VirtualTrading;
