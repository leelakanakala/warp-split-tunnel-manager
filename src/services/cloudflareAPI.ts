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
		const url = `${this.baseURL}/accounts/${accountId}/devices/policy`;
		
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
	 * Update split tunnel configuration for a specific WARP profile
	 */
	async updateSplitTunnel(
		accountId: string,
		profileId: string,
		tunnelEntries: SplitTunnelEntry[],
		mode: 'include' | 'exclude' = 'exclude'
	): Promise<boolean> {
		console.log(`Updating split tunnel for profile ${profileId} with ${tunnelEntries.length} entries...`);
		
		// Format the tunnel entries for the API
		const formattedEntries = tunnelEntries.map(entry => ({
			address: entry.address,
			description: entry.description || 'Zoom IP Range',
		}));

		// Cloudflare Zero Trust Split Tunnel API endpoint
		const url = `${this.baseURL}/accounts/${accountId}/devices/policy/${profileId}/split_tunnel`;
		
		const payload = {
			mode: mode,
			tunnels: formattedEntries,
		};

		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to update split tunnel: ${response.status} ${errorText}`);
		}

		const data = await response.json() as any;

		if (!data.success) {
			const errors = data.errors?.map((e: CloudflareError) => e.message).join(', ') || 'Unknown error';
			throw new Error(`Cloudflare API error: ${errors}`);
		}

		console.log(`Successfully updated split tunnel for profile ${profileId}`);
		return true;
	}

	/**
	 * Get current split tunnel configuration for a profile
	 */
	async getSplitTunnel(accountId: string, profileId: string): Promise<SplitTunnelEntry[]> {
		console.log(`Fetching split tunnel config for profile ${profileId}...`);
		
		const url = `${this.baseURL}/accounts/${accountId}/devices/policy/${profileId}/split_tunnel`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to fetch split tunnel: ${response.status} ${errorText}`);
		}

		const data = await response.json() as any;

		if (!data.success) {
			const errors = data.errors?.map((e: CloudflareError) => e.message).join(', ') || 'Unknown error';
			throw new Error(`Cloudflare API error: ${errors}`);
		}

		return data.result || [];
	}

	/**
	 * Merge Zoom IPs with existing split tunnel entries
	 * This preserves existing non-Zoom entries and adds/updates Zoom entries
	 */
	async mergeSplitTunnelEntries(
		accountId: string,
		profileId: string,
		zoomIPs: string[]
	): Promise<SplitTunnelEntry[]> {
		// Get existing split tunnel entries
		const existingEntries = await this.getSplitTunnel(accountId, profileId);
		
		// Filter out old Zoom entries (identified by description)
		const nonZoomEntries = existingEntries.filter(
			entry => !entry.description?.toLowerCase().includes('zoom')
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
	 * Update all WARP profiles in an account with Zoom IPs
	 */
	async updateAllProfilesWithZoomIPs(
		accountId: string,
		zoomIPs: string[]
	): Promise<{
		success: boolean;
		updated: number;
		failed: number;
		results: Array<{ profileId: string; profileName: string; success: boolean; error?: string }>;
	}> {
		const profiles = await this.fetchWARPProfiles(accountId);
		
		const results: Array<{ profileId: string; profileName: string; success: boolean; error?: string }> = [];
		let updated = 0;
		let failed = 0;

		for (const profile of profiles) {
			try {
				// Merge with existing entries to preserve non-Zoom configurations
				const mergedEntries = await this.mergeSplitTunnelEntries(
					accountId,
					profile.profile_id,
					zoomIPs
				);

				// Update the split tunnel with merged entries
				await this.updateSplitTunnel(
					accountId,
					profile.profile_id,
					mergedEntries,
					'exclude' // Exclude mode means these IPs will bypass the tunnel
				);

				updated++;
				results.push({
					profileId: profile.profile_id,
					profileName: profile.name,
					success: true,
				});

				// Add a small delay to avoid rate limiting
				await this.delay(500);

			} catch (error) {
				failed++;
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				console.error(`Failed to update profile ${profile.name}:`, errorMessage);
				
				results.push({
					profileId: profile.profile_id,
					profileName: profile.name,
					success: false,
					error: errorMessage,
				});
			}
		}

		return {
			success: failed === 0,
			updated,
			failed,
			results,
		};
	}

	/**
	 * Helper function to add delay between API calls
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
