import {
	CloudflareAccount,
	CloudflareAccountsResponse,
	WARPProfile,
	WARPProfilesResponse,
	SplitTunnelEntry,
	CloudflareError,
} from '../types';

/**
 * Cloudflare API Service
 * Handles all interactions with Cloudflare API for accounts and Zero Trust WARP profiles
 */
export class CloudflareAPIService {
	private apiToken: string;
	private baseURL = 'https://api.cloudflare.com/client/v4';

	constructor(apiToken: string) {
		this.apiToken = apiToken;
	}

	/**
	 * Fetch all accounts accessible with the API token
	 */
	async fetchAccounts(): Promise<CloudflareAccount[]> {
		console.log('Fetching Cloudflare accounts...');
		
		const response = await fetch(`${this.baseURL}/accounts?per_page=50`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to fetch accounts: ${response.status} ${errorText}`);
		}

		const data: CloudflareAccountsResponse = await response.json();

		if (!data.success) {
			const errors = data.errors.map((e: CloudflareError) => e.message).join(', ');
			throw new Error(`Cloudflare API error: ${errors}`);
		}

		console.log(`Found ${data.result.length} accounts`);
		return data.result;
	}

	/**
	 * Fetch all WARP profiles for a specific account
	 */
	async fetchWARPProfiles(accountId: string): Promise<WARPProfile[]> {
		console.log(`Fetching WARP profiles for account ${accountId}...`);
		
		// Cloudflare Zero Trust Device Profiles API endpoint
		const url = `${this.baseURL}/accounts/${accountId}/devices/policies`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to fetch WARP profiles: ${response.status} ${errorText}`);
		}

		const data: WARPProfilesResponse = await response.json();

		if (!data.success) {
			const errors = data.errors.map((e: CloudflareError) => e.message).join(', ');
			throw new Error(`Cloudflare API error: ${errors}`);
		}

		// Handle case where result might not be an array
		const profiles = Array.isArray(data.result) ? data.result : [];
		console.log(`Found ${profiles.length} WARP profiles`);
		return profiles;
	}

	/**
	 * Update split tunnel exclude configuration for the account
	 */
	async updateSplitTunnelExclude(
		accountId: string,
		tunnelEntries: SplitTunnelEntry[]
	): Promise<boolean> {
		console.log(`Updating split tunnel exclude with ${tunnelEntries.length} entries...`);
		
		// Format the tunnel entries for the API
		const formattedEntries = tunnelEntries.map(entry => ({
			address: entry.address,
			description: entry.description || 'Zoom IP Range',
		}));

		// Update the account-level exclude list
		const url = `${this.baseURL}/accounts/${accountId}/devices/policy/exclude`;
		
		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(formattedEntries),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to update split tunnel exclude: ${response.status} ${errorText}`);
		}

		const data = await response.json() as any;

		if (!data.success) {
			const errors = data.errors?.map((e: CloudflareError) => e.message).join(', ') || 'Unknown error';
			throw new Error(`Cloudflare API error: ${errors}`);
		}

		console.log(`Successfully updated split tunnel exclude list`);
		return true;
	}

	/**
	 * Get current split tunnel configuration for exclude mode
	 */
	async getSplitTunnelExclude(accountId: string): Promise<SplitTunnelEntry[]> {
		console.log(`Fetching split tunnel exclude config for account ${accountId}...`);
		
		const url = `${this.baseURL}/accounts/${accountId}/devices/policy/exclude`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to fetch split tunnel exclude: ${response.status} ${errorText}`);
		}

		const data = await response.json() as any;

		if (!data.success) {
			const errors = data.errors?.map((e: CloudflareError) => e.message).join(', ') || 'Unknown error';
			throw new Error(`Cloudflare API error: ${errors}`);
		}

		// Return the exclude list
		if (Array.isArray(data.result)) {
			return data.result.map((item: any) => ({
				address: item.address || item.host,
				description: item.description
			}));
		}

		return [];
	}

	/**
	 * Merge Zoom IPs with existing split tunnel exclude entries
	 * This preserves existing non-Zoom entries and adds/updates Zoom entries
	 */
	async mergeSplitTunnelExcludeEntries(
		accountId: string,
		zoomIPs: string[]
	): Promise<SplitTunnelEntry[]> {
		// Get existing split tunnel exclude entries
		const existingEntries = await this.getSplitTunnelExclude(accountId);
		
		// Filter out old Zoom entries (identified by description)
		const nonZoomEntries = existingEntries.filter(
			(entry: SplitTunnelEntry) => !entry.description?.toLowerCase().includes('zoom')
		);

		// Create new Zoom entries
		const zoomEntries: SplitTunnelEntry[] = zoomIPs.map(ip => ({
			address: ip,
			description: 'Zoom IP Range (Auto-updated)',
		}));

		// Merge: keep existing non-Zoom entries and add new Zoom entries
		const mergedEntries = [...nonZoomEntries, ...zoomEntries];

		console.log(`Merged entries: ${nonZoomEntries.length} existing + ${zoomEntries.length} Zoom = ${mergedEntries.length} total`);
		
		return mergedEntries;
	}

	/**
	 * Update account-level split tunnel exclude list with Zoom IPs
	 * This updates the exclude list that applies to all profiles using exclude mode
	 */
	async updateAccountWithZoomIPs(
		accountId: string,
		zoomIPs: string[]
	): Promise<{
		success: boolean;
		updated: number;
		failed: number;
		results: Array<{ profileId: string; profileName: string; success: boolean; error?: string }>;
	}> {
		try {
			// Merge with existing entries to preserve non-Zoom configurations
			const mergedEntries = await this.mergeSplitTunnelExcludeEntries(
				accountId,
				zoomIPs
			);

			// Update the account-level split tunnel exclude list
			await this.updateSplitTunnelExclude(accountId, mergedEntries);

			// Get profiles to report which ones will be affected
			const profiles = await this.fetchWARPProfiles(accountId);
			const excludeProfiles = profiles.filter(p => p.tunnel?.mode === 'exclude');
			const includeProfiles = profiles.filter(p => p.tunnel?.mode === 'include');

			console.log(`Updated exclude list. ${excludeProfiles.length} profiles using exclude mode will be affected.`);
			if (includeProfiles.length > 0) {
				console.log(`Note: ${includeProfiles.length} profiles using include mode will NOT be affected.`);
			}

			const results = excludeProfiles.map(profile => ({
				profileId: profile.profile_id || '',
				profileName: profile.name,
				success: true,
			}));

			return {
				success: true,
				updated: 1, // One exclude list updated
				failed: 0,
				results,
			};

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`Failed to update split tunnel exclude list:`, errorMessage);
			
			return {
				success: false,
				updated: 0,
				failed: 1,
				results: [{
					profileId: '',
					profileName: 'Account-level exclude list',
					success: false,
					error: errorMessage,
				}],
			};
		}
	}

	/**
	 * Helper function to add delay between API calls
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
