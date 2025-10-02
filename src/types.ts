/**
 * Cloudflare Worker Environment bindings
 */
export interface Env {
	// KV namespace for caching Zoom IPs
	ZOOM_IP_CACHE: KVNamespace;
	
	// Assets binding for serving static files
	ASSETS: Fetcher;
	
	// Secrets
	CLOUDFLARE_API_TOKEN: string;
	SELECTED_ACCOUNT_ID?: string;
	
	// Environment variables
	ZOOM_IP_SOURCE_URL: string;
	UPDATE_INTERVAL_HOURS: string;
	MAX_RETRIES: string;
}

/**
 * Cloudflare Account
 */
export interface CloudflareAccount {
	id: string;
	name: string;
	type: string;
	settings?: {
		enforce_twofactor?: boolean;
	};
}

/**
 * Cloudflare Accounts API Response
 */
export interface CloudflareAccountsResponse {
	result: CloudflareAccount[];
	success: boolean;
	errors: CloudflareError[];
	messages: string[];
	result_info?: {
		page: number;
		per_page: number;
		count: number;
		total_count: number;
	};
}

/**
 * Cloudflare Zero Trust Device Settings Profile (WARP Profile)
 */
export interface WARPProfile {
	profile_id?: string;
	policy_id?: string;
	id?: string;
	name: string;
	description?: string;
	enabled: boolean;
	is_default: boolean;
	allowed_to_authenticate: boolean;
	switch_locked: boolean;
	
	// Split tunnel configuration
	tunnel?: {
		mode: 'include' | 'exclude';
		host?: {
			address: string;
			description?: string;
		}[];
	};
	
	// Other settings
	captive_portal?: number;
	disable_auto_fallback?: boolean;
	support_url?: string;
}

/**
 * WARP Profiles API Response
 */
export interface WARPProfilesResponse {
	result: WARPProfile[];
	success: boolean;
	errors: CloudflareError[];
	messages: string[];
}

/**
 * Split Tunnel Configuration
 */
export interface SplitTunnelConfig {
	mode: 'include' | 'exclude';
	tunnels: SplitTunnelEntry[];
}

/**
 * Split Tunnel Entry
 */
export interface SplitTunnelEntry {
	address: string;
	description?: string;
	host?: string;
}

/**
 * Zoom IP Range Entry
 */
export interface ZoomIPEntry {
	ip: string;
	cidr?: string;
	description: string;
	last_updated: string;
}

/**
 * Zoom IP Data
 */
export interface ZoomIPData {
	ips: string[];
	last_fetched: string;
	source_url: string;
	total_count: number;
}

/**
 * Update Result
 */
export interface UpdateResult {
	success: boolean;
	account_id: string;
	account_name: string;
	profiles_updated: number;
	profiles_failed: number;
	ips_added: number;
	total_ips: number;
	processing_time_ms: number;
	timestamp: string;
	errors: string[];
	updated_profiles: {
		profile_id: string;
		profile_name: string;
		success: boolean;
		error?: string;
		reason?: string;
	}[];
}

/**
 * System Status
 */
export interface SystemStatus {
	last_update: string | null;
	last_update_success: boolean;
	zoom_ips_count: number;
	zoom_ips_last_fetched: string | null;
	accounts_available: number;
	selected_account_id: string | null;
	selected_account_name: string | null;
	warp_profiles_count: number;
	next_scheduled_update: string | null;
}

/**
 * Cloudflare API Error
 */
export interface CloudflareError {
	code: number;
	message: string;
}

/**
 * Generic API Response
 */
export interface APIResponse<T = any> {
	success: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
		details?: any;
	};
	metadata: {
		timestamp: string;
		processing_time_ms: number;
		version: string;
	};
}

/**
 * Account Selection Request
 */
export interface AccountSelectionRequest {
	account_id: string;
}

/**
 * Manual Update Request
 */
export interface ManualUpdateRequest {
	account_id?: string;
	force_fetch?: boolean;
}

/**
 * Storage Keys
 */
export enum StorageKey {
	ZOOM_IPS = 'zoom_ips',
	LAST_UPDATE = 'last_update',
	SELECTED_ACCOUNT = 'selected_account',
	UPDATE_HISTORY = 'update_history',
}
