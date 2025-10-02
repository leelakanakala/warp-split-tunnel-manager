import { Env, UpdateResult, SystemStatus, CloudflareAccount, ZoomIPData } from '../types';
import { CloudflareAPIService } from './cloudflareAPI';
import { ZoomIPFetcher } from './zoomIPFetcher';
import { StorageService } from './storageService';

/**
 * WARP Profile Manager
 * Main orchestration service that coordinates all operations
 */
export class WARPProfileManager {
	private env: Env;
	private cloudflareAPI: CloudflareAPIService;
	private zoomFetcher: ZoomIPFetcher;
	private storage: StorageService;

	constructor(env: Env) {
		this.env = env;
		this.cloudflareAPI = new CloudflareAPIService(
			env.CLOUDFLARE_API_TOKEN,
			env.CLOUDFLARE_ACCOUNTS_TOKEN // Pass separate accounts token if available
		);
		this.zoomFetcher = new ZoomIPFetcher(
			env.ZOOM_IP_SOURCE_URL,
			parseInt(env.MAX_RETRIES) || 3
		);
		this.storage = new StorageService(env.ZOOM_IP_CACHE);
	}

	/**
	 * Get all available Cloudflare accounts
	 */
	async getAccounts(): Promise<CloudflareAccount[]> {
		return await this.cloudflareAPI.fetchAccounts();
	}

	/**
	 * Select an account for WARP profile management
	 */
	async selectAccount(accountId: string): Promise<void> {
		const accounts = await this.getAccounts();
		const account = accounts.find(a => a.id === accountId);
		
		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}

		await this.storage.storeSelectedAccount(account.id, account.name);
		console.log(`Selected account: ${account.name} (${account.id})`);
	}

	/**
	 * Get the currently selected account
	 */
	async getSelectedAccount(): Promise<{ id: string; name: string } | null> {
		// Check if there's a pre-configured account in environment
		if (this.env.SELECTED_ACCOUNT_ID) {
			const accounts = await this.getAccounts();
			const account = accounts.find(a => a.id === this.env.SELECTED_ACCOUNT_ID);
			if (account) {
				return { id: account.id, name: account.name };
			}
		}

		// Otherwise, get from storage
		const stored = await this.storage.getSelectedAccount();
		return stored ? { id: stored.id, name: stored.name } : null;
	}

	/**
	 * Perform a full update: fetch Zoom IPs and update WARP profiles (only if IPs changed, unless forced)
	 */
	async performUpdate(accountId?: string, forceFetch: boolean = false): Promise<UpdateResult> {
		const startTime = Date.now();
		console.log('Starting WARP profile update...');

		try {
			// Determine which account to use
			let targetAccountId = accountId;
			let targetAccountName = '';

			if (!targetAccountId) {
				const selected = await this.getSelectedAccount();
				if (!selected) {
					throw new Error('No account selected. Please select an account first.');
				}
				targetAccountId = selected.id;
				targetAccountName = selected.name;
			} else {
				const accounts = await this.getAccounts();
				const account = accounts.find(a => a.id === targetAccountId);
				if (!account) {
					throw new Error(`Account ${targetAccountId} not found`);
				}
				targetAccountName = account.name;
			}

			// Get previously stored IPs for comparison
			const previousIPData = await this.storage.getZoomIPs();
			
			// Fetch Zoom IPs (from cache or fresh)
			let zoomIPData;
			let fetchedFresh = false;
			
			if (forceFetch) {
				console.log('Force fetching Zoom IPs...');
				zoomIPData = await this.zoomFetcher.fetchZoomIPs();
				fetchedFresh = true;
			} else {
				// Try to get from cache first
				zoomIPData = await this.storage.getZoomIPs();
				if (!zoomIPData) {
					console.log('No cached Zoom IPs, fetching fresh...');
					zoomIPData = await this.zoomFetcher.fetchZoomIPs();
					fetchedFresh = true;
				} else {
					console.log(`Using cached Zoom IPs (${zoomIPData.total_count} entries)`);
				}
			}

			// Compare IPs to see if there's any change
			const hasChanges = this.hasIPChanges(previousIPData, zoomIPData);
			
			if (!hasChanges && !forceFetch) {
				console.log('No changes detected in Zoom IP list. Skipping profile updates.');
				const result: UpdateResult = {
					success: true,
					timestamp: new Date().toISOString(),
					account_id: targetAccountId,
					account_name: targetAccountName,
					profiles_updated: 0,
					profiles_failed: 0,
					ips_added: zoomIPData.total_count,
					processing_time_ms: Date.now() - startTime,
					message: 'No changes detected in Zoom IP list - profiles not updated',
					updated_profiles: [],
				};

				await this.storage.storeLastUpdate(result);
				console.log('Update completed (no changes)');
				return result;
			}

			// Store the new IP data if fetched fresh
			if (fetchedFresh) {
				await this.storage.storeZoomIPs(zoomIPData);
			}

			// Update WARP profiles with Zoom IPs in their split tunnel exclude lists
			console.log(`Updating WARP profile split tunnel exclude lists for account ${targetAccountName}...`);
			const updateResults = await this.cloudflareAPI.updateAccountWithZoomIPs(
				targetAccountId,
				zoomIPData.ips
			);

			// Prepare result
			const result: UpdateResult = {
				success: updateResults.updated > 0, // Success if at least one profile was updated
				account_id: targetAccountId,
				account_name: targetAccountName,
				profiles_updated: updateResults.updated,
				profiles_failed: updateResults.failed,
				ips_added: zoomIPData.total_count,
				processing_time_ms: Date.now() - startTime,
				timestamp: new Date().toISOString(),
				updated_profiles: updateResults.results.map((r: any) => ({
					profile_id: r.profileId || 'default',
					profile_name: r.profileName || 'Unknown Profile',
					success: r.success,
					error: r.error || undefined,
					reason: r.reason || undefined
				})),
			};

			// Store the result
			await this.storage.storeLastUpdate(result);

			console.log(`Update completed: ${result.profiles_updated} profiles updated, ${result.profiles_failed} failed`);
			return result;

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error('Update failed:', errorMessage);

			const result: UpdateResult = {
				success: false,
				account_id: accountId || '',
				account_name: '',
				profiles_updated: 0,
				profiles_failed: 0,
				ips_added: 0,
				processing_time_ms: Date.now() - startTime,
				timestamp: new Date().toISOString(),
				error: errorMessage,
				updated_profiles: [],
			};

			await this.storage.storeLastUpdate(result);
			return result;
		}
	}

	/**
	 * Get system status
	 */
	async getStatus(): Promise<SystemStatus> {
		const lastUpdate = await this.storage.getLastUpdate();
		const zoomIPData = await this.storage.getZoomIPs();
		const selectedAccount = await this.getSelectedAccount();

		// Get WARP profiles count if account is selected
		let warpProfilesCount = 0;
		if (selectedAccount) {
			try {
				const profiles = await this.cloudflareAPI.fetchWARPProfiles(selectedAccount.id);
				warpProfilesCount = profiles.length;
			} catch (error) {
				console.error('Failed to fetch WARP profiles count:', error);
			}
		}

		// Get accounts count
		let accountsCount = 0;
		try {
			const accounts = await this.getAccounts();
			accountsCount = accounts.length;
		} catch (error) {
			console.error('Failed to fetch accounts count:', error);
		}

		// Calculate next scheduled update (based on cron: daily at 3 AM UTC)
		const now = new Date();
		const nextUpdate = new Date(now);
		nextUpdate.setUTCHours(3, 0, 0, 0);
		if (nextUpdate <= now) {
			nextUpdate.setUTCDate(nextUpdate.getUTCDate() + 1);
		}

		return {
			last_update: lastUpdate ? lastUpdate.timestamp : null,
			last_update_success: lastUpdate ? lastUpdate.success : false,
			zoom_ips_count: zoomIPData ? zoomIPData.total_count : 0,
			zoom_ips_last_fetched: zoomIPData ? zoomIPData.last_fetched : null,
			accounts_available: accountsCount,
			selected_account_id: selectedAccount ? selectedAccount.id : null,
			selected_account_name: selectedAccount ? selectedAccount.name : null,
			warp_profiles_count: warpProfilesCount,
			next_scheduled_update: nextUpdate.toISOString(),
		};
	}

	/**
	 * Compare two IP datasets to detect changes
	 */
	private hasIPChanges(previous: ZoomIPData | null, current: ZoomIPData): boolean {
		if (!previous) {
			console.log('No previous IP data - treating as changed');
			return true;
		}

		// Compare counts first (quick check)
		if (previous.total_count !== current.total_count) {
			console.log(`IP count changed: ${previous.total_count} -> ${current.total_count}`);
			return true;
		}

		// Compare IP arrays
		const prevSet = new Set(previous.ips);
		const currSet = new Set(current.ips);

		// Check if any IPs were added or removed
		for (const ip of current.ips) {
			if (!prevSet.has(ip)) {
				console.log(`New IP detected: ${ip}`);
				return true;
			}
		}

		for (const ip of previous.ips) {
			if (!currSet.has(ip)) {
				console.log(`IP removed: ${ip}`);
				return true;
			}
		}

		console.log('No changes detected in IP list');
		return false;
	}

	/**
	 * Check if an update is needed based on interval
	 */
	async isUpdateNeeded(): Promise<boolean> {
		const intervalHours = parseInt(this.env.UPDATE_INTERVAL_HOURS) || 24;
		return await this.storage.isUpdateNeeded(intervalHours);
	}

	/**
	 * Get update history
	 */
	async getUpdateHistory(limit: number = 10): Promise<UpdateResult[]> {
		return await this.storage.getUpdateHistory(limit);
	}

	/**
	 * Reset all data (dangerous operation)
	 */
	async reset(): Promise<void> {
		await this.storage.clearAll();
		console.log('System reset completed');
	}
}
