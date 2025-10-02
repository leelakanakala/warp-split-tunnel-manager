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
	private accountsToken: string;
	private baseURL = 'https://api.cloudflare.com/client/v4';

	constructor(apiToken: string, accountsToken?: string) {
		this.apiToken = apiToken;
		this.accountsToken = accountsToken || apiToken; // Use separate token if provided, otherwise use main token
	}

	/**
	 * Fetch all accounts accessible with the API token
	 */
	async fetchAccounts(): Promise<CloudflareAccount[]> {
		console.log('[API] Fetching Cloudflare accounts...');
		
		let allAccounts: CloudflareAccount[] = [];
		let page = 1;
		let hasMore = true;
		
		while (hasMore) {
			const url = `${this.baseURL}/accounts?per_page=50&page=${page}`;
			console.log(`[API] GET ${url}`);
			console.log(`[API] Using accounts token: ${this.accountsToken.substring(0, 10)}...`);
			
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.accountsToken}`,
					'Content-Type': 'application/json',
				},
			});

			console.log(`[API] Response: ${response.status} ${response.statusText}`);

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`[API] Error: ${errorText}`);
				throw new Error(`Failed to fetch accounts: ${response.status} ${errorText}`);
			}

			const data: CloudflareAccountsResponse = await response.json();

			if (!data.success) {
				const errors = data.errors.map((e: CloudflareError) => e.message).join(', ');
				console.error(`[API] Cloudflare API error: ${errors}`);
				throw new Error(`Cloudflare API error: ${errors}`);
			}

			console.log(`[API] Page ${page}: Found ${data.result.length} accounts`);
			console.log(`[API] Result info:`, JSON.stringify(data.result_info));
			
			allAccounts = allAccounts.concat(data.result);
			
			// Check if there are more pages
			if (data.result_info && data.result_info.total_count > allAccounts.length) {
				console.log(`[API] More pages available. Total: ${data.result_info.total_count}, Fetched: ${allAccounts.length}`);
				page++;
			} else {
				console.log(`[API] No more pages. Total fetched: ${allAccounts.length}`);
				hasMore = false;
			}
		}

		console.log(`[API] Found ${allAccounts.length} total accounts`);
		console.log(`[API] Account names:`, allAccounts.map(a => a.name).join(', '));
		return allAccounts;
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
	 * Fetch individual profile details including split tunnel configuration
	 * For default profile (no policy_id), use /devices/policy
	 * For custom profiles, use /devices/policy/{policy_id}
	 */
	async fetchProfileDetails(accountId: string, policyId: string | null, isDefault: boolean = false): Promise<any> {
		const url = isDefault || !policyId
			? `${this.baseURL}/accounts/${accountId}/devices/policy`
			: `${this.baseURL}/accounts/${accountId}/devices/policy/${policyId}`;
		
		console.log(`[API] GET ${url}`);
		console.log(`[API] Fetching ${isDefault ? 'default' : 'custom'} profile details${policyId ? ` for policy ${policyId}` : ''}...`);
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
		});

		console.log(`[API] Response: ${response.status} ${response.statusText}`);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[API] Error: ${errorText}`);
			throw new Error(`Failed to fetch profile details: ${response.status} ${errorText}`);
		}

		const data = await response.json() as any;

		if (!data.success) {
			const errors = data.errors?.map((e: CloudflareError) => e.message).join(', ') || 'Unknown error';
			console.error(`[API] Cloudflare API error: ${errors}`);
			throw new Error(`Cloudflare API error: ${errors}`);
		}

		console.log(`[API] Successfully fetched profile details`);
		return data.result;
	}

	/**
	 * Update individual profile's exclude list with Zoom IPs
	 * For default profile (no policy_id), use /devices/policy/exclude
	 * For custom profiles, use /devices/policy/{policy_id}/exclude
	 */
	async updateProfileExcludeList(
		accountId: string,
		policyId: string | null,
		profileName: string,
		zoomIPs: string[],
		isDefault: boolean = false
	): Promise<boolean> {
		const url = isDefault || !policyId
			? `${this.baseURL}/accounts/${accountId}/devices/policy/exclude`
			: `${this.baseURL}/accounts/${accountId}/devices/policy/${policyId}/exclude`;
		
		console.log(`[API] PUT ${url}`);
		console.log(`[API] Updating ${isDefault ? 'default' : 'custom'} profile "${profileName}"${policyId ? ` (${policyId})` : ''} exclude list with ${zoomIPs.length} Zoom IPs...`);
		
		// Get existing exclude list
		const profileDetails = await this.fetchProfileDetails(accountId, policyId, isDefault);
		const existingExclude = profileDetails.exclude || [];
		
		// Filter out old Zoom entries
		const nonZoomEntries = existingExclude.filter(
			(entry: any) => !entry.description?.toLowerCase().includes('zoom')
		);

		console.log(`[API] Found ${existingExclude.length} existing entries, ${nonZoomEntries.length} non-Zoom entries`);

		// Create new entries with Zoom IPs
		const zoomEntries = zoomIPs.map(ip => ({
			address: ip,
			description: 'Zoom IP Range (Auto-updated)',
		}));

		// Merge entries
		const mergedEntries = [...nonZoomEntries, ...zoomEntries];
		console.log(`[API] Merging ${nonZoomEntries.length} existing + ${zoomEntries.length} Zoom = ${mergedEntries.length} total entries`);

		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(mergedEntries),
		});

		console.log(`[API] Response: ${response.status} ${response.statusText}`);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[API] Error: ${errorText}`);
			throw new Error(`Failed to update profile exclude list: ${response.status} ${errorText}`);
		}

		const data = await response.json() as any;

		if (!data.success) {
			const errors = data.errors?.map((e: CloudflareError) => e.message).join(', ') || 'Unknown error';
			console.error(`[API] Cloudflare API error: ${errors}`);
			throw new Error(`Cloudflare API error: ${errors}`);
		}

		console.log(`[API] Successfully updated profile "${profileName}" exclude list`);
		return true;
	}

	/**
	 * Update all WARP profiles with Zoom IPs (only profiles with exclude mode)
	 */
	async updateAccountWithZoomIPs(
		accountId: string,
		zoomIPs: string[]
	): Promise<{
		success: boolean;
		updated: number;
		failed: number;
		results: Array<{ profileId: string; profileName: string; success: boolean; error?: string; reason?: string }>;
	}> {
		const results: Array<{ profileId: string; profileName: string; success: boolean; error?: string; reason?: string }> = [];
		let updated = 0;
		let failed = 0;

		try {
			// Get all profiles
			console.log(`[FLOW] Step 1: Fetching all WARP profiles for account ${accountId}...`);
			const profiles = await this.fetchWARPProfiles(accountId);
			console.log(`[FLOW] Found ${profiles.length} total profiles`);

			// Process each profile
			for (const profile of profiles) {
				const policyId = profile.policy_id || profile.id;
				const profileName = profile.name || 'Default';
				// If no policy_id, treat it as the default profile
				const isDefault = !policyId || profile.is_default || false;

				try {
					if (isDefault) {
						console.log(`[FLOW] Step 2: Fetching details for DEFAULT profile...`);
					} else {
						console.log(`[FLOW] Step 2: Fetching details for profile "${profileName}" (${policyId})...`);
					}
					
					const profileDetails = await this.fetchProfileDetails(accountId, policyId || null, isDefault);

					// Check if profile has include or exclude
					const hasInclude = profileDetails.include && Array.isArray(profileDetails.include) && profileDetails.include.length > 0;
					const hasExclude = profileDetails.exclude !== undefined;

					console.log(`[FLOW] Profile "${profileName}" (${isDefault ? 'DEFAULT' : policyId}) - hasInclude: ${hasInclude}, hasExclude: ${hasExclude}`);

					// Format profile name - just "Default" for default profile, otherwise use profile name
					const displayName = isDefault ? 'Default' : profileName;

					if (hasInclude) {
						console.log(`[FLOW] Skipping profile "${profileName}" - uses include mode`);
						results.push({
							profileId: policyId || 'default',
							profileName: displayName,
							success: false,
							reason: 'Profile uses include mode - Cannot add Zoom IPs (include mode specifies which IPs go through tunnel, not which bypass it)',
						});
						failed++;
					} else if (hasExclude || (!hasInclude && !hasExclude)) {
						// Update profiles with exclude mode or no mode set
						console.log(`[FLOW] Step 3: Updating ${isDefault ? 'DEFAULT' : ''} profile "${profileName}" with Zoom IPs...`);
						await this.updateProfileExcludeList(accountId, policyId || null, profileName, zoomIPs, isDefault);
						
						results.push({
							profileId: policyId || 'default',
							profileName: displayName,
							success: true,
							reason: 'Profile uses exclude mode - Zoom IPs added to split tunnel exclude list',
						});
						updated++;
						console.log(`[FLOW] ✓ Successfully updated profile "${profileName}"`);
					}

					// Add delay to avoid rate limiting
					await this.delay(500);

				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					console.error(`[FLOW] ✗ Failed to update profile "${profileName}":`, errorMessage);
					
					// Format profile name with Default label if needed
					const displayName = isDefault ? `${profileName} (Default)` : profileName;
					
					results.push({
						profileId: policyId || 'default',
						profileName: displayName,
						success: false,
						error: errorMessage,
					});
					failed++;
				}
			}

			console.log(`[FLOW] Update complete: ${updated} updated, ${failed} failed`);

			return {
				success: failed === 0,
				updated,
				failed,
				results,
			};

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`[FLOW] Fatal error during update:`, errorMessage);
			
			return {
				success: false,
				updated,
				failed: failed + 1,
				results,
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
