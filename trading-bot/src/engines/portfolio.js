/**
 * Portfolio – tracks balance, open positions, and trade history.
 */
class Portfolio {
  constructor(initialBalance, logger) {
    this.balance = initialBalance;
    this.initialBalance = initialBalance;
    this.positions = [];         // open positions
    this.tradeHistory = [];      // closed trades
    this.log = logger;
  }

  /**
   * Open a new position.
   */
  openPosition({ side, price, quantity, stopLoss, takeProfit, reason, time }) {
    const cost = price * quantity;
    if (cost > this.balance) {
      this.log.warn(`Insufficient balance for trade: need ${cost.toFixed(2)} have ${this.balance.toFixed(2)}`);
      return null;
    }

    this.balance -= cost;
    const position = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      side,
      entryPrice: price,
      quantity,
      value: cost,
      stopLoss,
      takeProfit,
      reason,
      openTime: time || new Date().toISOString(),
      trailingStop: stopLoss,
    };
    this.positions.push(position);

    this.log.info(`OPEN ${side} | qty: ${quantity.toFixed(6)} @ ${price.toFixed(2)} | SL: ${stopLoss.toFixed(2)} | TP: ${takeProfit.toFixed(2)} | ${reason}`);
    return position;
  }

  /**
   * Close an existing position.
   */
  closePosition(positionId, currentPrice, reason, time) {
    const idx = this.positions.findIndex((p) => p.id === positionId);
    if (idx === -1) return null;

    const position = this.positions[idx];
    this.positions.splice(idx, 1);

    let pnl;
    if (position.side === 'BUY') {
      pnl = (currentPrice - position.entryPrice) * position.quantity;
    } else {
      pnl = (position.entryPrice - currentPrice) * position.quantity;
    }
    // Return the original cost + profit/loss to balance
    this.balance += position.value + pnl;
    const pnlPct = (pnl / position.value) * 100;

    const trade = {
      ...position,
      exitPrice: currentPrice,
      exitTime: time || new Date().toISOString(),
      pnl,
      pnlPct,
      exitReason: reason,
    };
    this.tradeHistory.push(trade);

    const emoji = pnl >= 0 ? '+' : '';
    this.log.info(`CLOSE ${position.side} | ${emoji}${pnl.toFixed(2)} (${emoji}${pnlPct.toFixed(1)}%) | entry: ${position.entryPrice.toFixed(2)} exit: ${currentPrice.toFixed(2)} | ${reason}`);

    return { trade, pnl };
  }

  /**
   * Get current portfolio value (balance + unrealized).
   */
  getTotalValue(currentPrice) {
    const unrealized = this.positions.reduce((sum, p) => {
      // Each open position ties up p.value (entry cost) and has unrealized PnL
      const pnl = p.side === 'BUY'
        ? (currentPrice - p.entryPrice) * p.quantity
        : (p.entryPrice - currentPrice) * p.quantity;
      return sum + p.value + pnl;
    }, 0);
    return this.balance + unrealized;
  }

  /**
   * Generate performance summary.
   */
  getSummary(currentPrice) {
    const totalValue = this.getTotalValue(currentPrice);
    const totalReturn = ((totalValue - this.initialBalance) / this.initialBalance) * 100;
    const trades = this.tradeHistory;
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const profitFactor = losses.length > 0 && losses.reduce((s, t) => s + Math.abs(t.pnl), 0) > 0
      ? wins.reduce((s, t) => s + t.pnl, 0) / losses.reduce((s, t) => s + Math.abs(t.pnl), 0)
      : wins.length > 0 ? Infinity : 0;

    // Max drawdown
    let peak = this.initialBalance;
    let maxDD = 0;
    let runningBalance = this.initialBalance;
    for (const trade of trades) {
      runningBalance += trade.pnl;
      if (runningBalance > peak) peak = runningBalance;
      const dd = ((peak - runningBalance) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }

    return {
      totalValue: totalValue.toFixed(2),
      totalReturn: totalReturn.toFixed(2) + '%',
      totalPnl: totalPnl.toFixed(2),
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate.toFixed(1) + '%',
      avgWin: avgWin.toFixed(2) + '%',
      avgLoss: avgLoss.toFixed(2) + '%',
      profitFactor: profitFactor === Infinity ? 'Inf' : profitFactor.toFixed(2),
      maxDrawdown: maxDD.toFixed(2) + '%',
      openPositions: this.positions.length,
    };
  }
}

module.exports = Portfolio;
