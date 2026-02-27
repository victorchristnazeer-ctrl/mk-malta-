/**
 * Risk Manager – enforces position sizing, stop-losses, take-profits,
 * trailing stops, daily loss limits, and max drawdown protection.
 */
class RiskManager {
  constructor(config, logger) {
    this.config = config;
    this.log = logger;
    this.dailyPnL = 0;
    this.dailyResetDate = this._today();
    this.peakBalance = config.initialBalance || 10000;
    this.halted = false;
    this.haltReason = '';
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Reset daily P&L if a new day has started.
   */
  checkDayRollover() {
    const today = this._today();
    if (today !== this.dailyResetDate) {
      this.log.info(`New trading day: ${today} – resetting daily P&L (was ${this.dailyPnL.toFixed(2)})`);
      this.dailyPnL = 0;
      this.dailyResetDate = today;
      // Un-halt if it was a daily-loss halt
      if (this.haltReason === 'daily_loss') {
        this.halted = false;
        this.haltReason = '';
        this.log.info('Daily loss halt lifted for new trading day');
      }
    }
  }

  /**
   * Determine whether trading should be halted.
   */
  isHalted() {
    return this.halted;
  }

  /**
   * Calculate position size (in quote currency, e.g. USDT) for a trade.
   */
  calculatePositionSize(balance, currentPrice) {
    const maxPct = this.config.risk.maxPositionSizePct / 100;
    const riskAmount = balance * maxPct;
    const stopLossPct = this.config.risk.stopLossPct / 100;
    // Size position so that a stop-loss hit only loses riskAmount
    const positionValue = riskAmount / stopLossPct;
    // Never exceed 25% of balance in a single position
    const maxPositionValue = balance * 0.25;
    const finalValue = Math.min(positionValue, maxPositionValue);
    const quantity = finalValue / currentPrice;

    this.log.debug(`Position sizing: balance=${balance.toFixed(2)} risk=${riskAmount.toFixed(2)} size=${finalValue.toFixed(2)} qty=${quantity.toFixed(6)}`);
    return { quantity, value: finalValue };
  }

  /**
   * Calculate stop-loss price for an entry.
   */
  getStopLoss(entryPrice, side) {
    const pct = this.config.risk.stopLossPct / 100;
    return side === 'BUY'
      ? entryPrice * (1 - pct)
      : entryPrice * (1 + pct);
  }

  /**
   * Calculate take-profit price for an entry.
   */
  getTakeProfit(entryPrice, side) {
    const pct = this.config.risk.takeProfitPct / 100;
    return side === 'BUY'
      ? entryPrice * (1 + pct)
      : entryPrice * (1 - pct);
  }

  /**
   * Update trailing stop and return new stop price.
   */
  updateTrailingStop(currentPrice, currentStop, side) {
    const trailPct = this.config.risk.trailingStopPct / 100;
    if (side === 'BUY') {
      const newStop = currentPrice * (1 - trailPct);
      return Math.max(currentStop, newStop);
    }
    const newStop = currentPrice * (1 + trailPct);
    return Math.min(currentStop, newStop);
  }

  /**
   * Check whether a position should be closed.
   * Returns { shouldClose, reason } or null.
   */
  checkExitConditions(position, currentPrice) {
    const { side, stopLoss, takeProfit } = position;

    if (side === 'BUY') {
      if (currentPrice <= stopLoss) return { shouldClose: true, reason: 'Stop-loss hit' };
      if (currentPrice >= takeProfit) return { shouldClose: true, reason: 'Take-profit hit' };
    } else {
      if (currentPrice >= stopLoss) return { shouldClose: true, reason: 'Stop-loss hit' };
      if (currentPrice <= takeProfit) return { shouldClose: true, reason: 'Take-profit hit' };
    }
    return { shouldClose: false, reason: null };
  }

  /**
   * Record realized P&L and check limits.
   */
  recordPnL(pnl, currentBalance) {
    this.dailyPnL += pnl;

    // Update peak balance
    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
    }

    // Check daily loss limit
    const dailyLossLimit = this.config.initialBalance * (this.config.risk.maxDailyLossPct / 100);
    if (this.dailyPnL < -dailyLossLimit) {
      this.halted = true;
      this.haltReason = 'daily_loss';
      this.log.warn(`HALTED: Daily loss limit reached (${this.dailyPnL.toFixed(2)} < -${dailyLossLimit.toFixed(2)})`);
    }

    // Check max drawdown
    const drawdownPct = ((this.peakBalance - currentBalance) / this.peakBalance) * 100;
    if (drawdownPct >= this.config.risk.maxDrawdownPct) {
      this.halted = true;
      this.haltReason = 'max_drawdown';
      this.log.warn(`HALTED: Max drawdown reached (${drawdownPct.toFixed(1)}% >= ${this.config.risk.maxDrawdownPct}%)`);
    }
  }

  /**
   * Check if the risk/reward ratio meets the minimum threshold.
   */
  meetsRiskReward(entryPrice, stopLoss, takeProfit) {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    if (risk === 0) return false;
    const ratio = reward / risk;
    return ratio >= this.config.risk.riskRewardRatio;
  }

  /**
   * Whether we can open another position.
   */
  canOpenPosition(openPositionCount) {
    if (this.halted) {
      this.log.warn(`Cannot open position: trading halted (${this.haltReason})`);
      return false;
    }
    if (openPositionCount >= this.config.risk.maxOpenPositions) {
      this.log.debug(`Cannot open position: max open positions reached (${openPositionCount}/${this.config.risk.maxOpenPositions})`);
      return false;
    }
    return true;
  }
}

module.exports = RiskManager;
