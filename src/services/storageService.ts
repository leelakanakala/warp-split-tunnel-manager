import { ZoomIPData, StorageKey, UpdateResult } from '../types';

/**
 * Storage Service
 * Manages KV storage for Zoom IP data and system state
 */
export class StorageService {
	private kv: KVNamespace;

	constructor(kv: KVNamespace) {
		this.kv = kv;
	}

	/**
	 * Store Zoom IP data
	 */
	async storeZoomIPs(data: ZoomIPData): Promise<void> {
		await this.kv.put(StorageKey.ZOOM_IPS, JSON.stringify(data));
		console.log(`Stored ${data.total_count} Zoom IPs in KV`);
	}

	/**
	 * Retrieve Zoom IP data
	 */
	async getZoomIPs(): Promise<ZoomIPData | null> {
		const data = await this.kv.get(StorageKey.ZOOM_IPS, 'text');
		if (!data) {
			return null;
		}
		return JSON.parse(data) as ZoomIPData;
	}

	/**
	 * Store selected account ID
	 */
	async storeSelectedAccount(accountId: string, accountName: string): Promise<void> {
		await this.kv.put(
			StorageKey.SELECTED_ACCOUNT,
			JSON.stringify({ id: accountId, name: accountName, selected_at: new Date().toISOString() })
		);
		console.log(`Stored selected account: ${accountName} (${accountId})`);
	}

	/**
	 * Get selected account
	 */
	async getSelectedAccount(): Promise<{ id: string; name: string; selected_at: string } | null> {
		const data = await this.kv.get(StorageKey.SELECTED_ACCOUNT, 'text');
		if (!data) {
			return null;
		}
		return JSON.parse(data);
	}

	/**
	 * Store last update result
	 */
	async storeLastUpdate(result: UpdateResult): Promise<void> {
		await this.kv.put(StorageKey.LAST_UPDATE, JSON.stringify(result));
		
		// Also append to update history
		await this.appendUpdateHistory(result);
	}

	/**
	 * Get last update result
	 */
	async getLastUpdate(): Promise<UpdateResult | null> {
		const data = await this.kv.get(StorageKey.LAST_UPDATE, 'text');
		if (!data) {
			return null;
		}
		return JSON.parse(data) as UpdateResult;
	}

	/**
	 * Append to update history (keep last 50 updates)
	 */
	private async appendUpdateHistory(result: UpdateResult): Promise<void> {
		const historyData = await this.kv.get(StorageKey.UPDATE_HISTORY, 'text');
		let history: UpdateResult[] = historyData ? JSON.parse(historyData) : [];
		
		// Add new result
		history.unshift(result);
		
		// Keep only last 50 updates
		if (history.length > 50) {
			history = history.slice(0, 50);
		}
		
		await this.kv.put(StorageKey.UPDATE_HISTORY, JSON.stringify(history));
	}

	/**
	 * Get update history
	 */
	async getUpdateHistory(limit: number = 10): Promise<UpdateResult[]> {
		const data = await this.kv.get(StorageKey.UPDATE_HISTORY, 'text');
		if (!data) {
			return [];
		}
		const history = JSON.parse(data) as UpdateResult[];
		return history.slice(0, limit);
	}

	/**
	 * Clear all stored data
	 */
	async clearAll(): Promise<void> {
		await Promise.all([
			this.kv.delete(StorageKey.ZOOM_IPS),
			this.kv.delete(StorageKey.LAST_UPDATE),
			this.kv.delete(StorageKey.SELECTED_ACCOUNT),
			this.kv.delete(StorageKey.UPDATE_HISTORY),
		]);
		console.log('Cleared all KV storage');
	}

	/**
	 * Check if update is needed based on last update time
	 */
	async isUpdateNeeded(intervalHours: number): Promise<boolean> {
		const lastUpdate = await this.getLastUpdate();
		
		if (!lastUpdate) {
			return true; // No previous update
		}

		const lastUpdateTime = new Date(lastUpdate.processing_time_ms).getTime();
		const now = Date.now();
		const hoursSinceUpdate = (now - lastUpdateTime) / (1000 * 60 * 60);

		return hoursSinceUpdate >= intervalHours;
	}
}
