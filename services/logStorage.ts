
import { SecurityTransaction } from '../types';

class LogStorageService {
  private transactions: SecurityTransaction[] = [];

  public addTransaction(transaction: SecurityTransaction) {
    this.transactions.unshift(transaction);
  }

  public getTransactions(): SecurityTransaction[] {
    return this.transactions;
  }

  public exportLogs() {
    if (this.transactions.length === 0) return;
    
    const dataStr = JSON.stringify(this.transactions, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `sentinel_audit_${new Date().toISOString()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  public clear() {
    this.transactions = [];
  }
}

export const logStorage = new LogStorageService();
