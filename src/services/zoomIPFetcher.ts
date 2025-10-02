import { ZoomIPData } from '../types';

/**
 * Zoom IP Fetcher Service
 * Fetches and parses Zoom IP ranges from the official Zoom source
 */
export class ZoomIPFetcher {
	private sourceURL: string;
	private maxRetries: number;

	constructor(sourceURL: string, maxRetries: number = 3) {
		this.sourceURL = sourceURL;
		this.maxRetries = maxRetries;
	}

	/**
	 * Fetch Zoom IP ranges from the source URL
	 */
	async fetchZoomIPs(): Promise<ZoomIPData> {
		console.log(`Fetching Zoom IPs from ${this.sourceURL}...`);
		
		let lastError: Error | null = null;
		
		for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
			try {
				const response = await fetch(this.sourceURL, {
					method: 'GET',
					headers: {
						'User-Agent': 'Zoom-WARP-Manager/1.0',
					},
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const text = await response.text();
				const ips = this.parseZoomIPText(text);

				console.log(`Successfully fetched ${ips.length} Zoom IP ranges`);

				return {
					ips,
					last_fetched: new Date().toISOString(),
					source_url: this.sourceURL,
					total_count: ips.length,
				};

			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error');
				console.error(`Attempt ${attempt}/${this.maxRetries} failed:`, lastError.message);
				
				if (attempt < this.maxRetries) {
					// Exponential backoff
					const delay = Math.pow(2, attempt) * 1000;
					console.log(`Retrying in ${delay}ms...`);
					await this.delay(delay);
				}
			}
		}

		throw new Error(`Failed to fetch Zoom IPs after ${this.maxRetries} attempts: ${lastError?.message}`);
	}

	/**
	 * Parse Zoom IP text file
	 * The file contains IP ranges in CIDR notation, one per line
	 * Lines starting with # are comments
	 */
	private parseZoomIPText(text: string): string[] {
		const lines = text.split('\n');
		const ips: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			
			// Skip empty lines and comments
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}

			// Validate IP/CIDR format
			if (this.isValidIPOrCIDR(trimmed)) {
				ips.push(trimmed);
			} else {
				console.warn(`Skipping invalid IP/CIDR: ${trimmed}`);
			}
		}

		return ips;
	}

	/**
	 * Validate IP address or CIDR notation
	 */
	private isValidIPOrCIDR(value: string): boolean {
		// Check for CIDR notation (e.g., 192.168.1.0/24)
		const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
		if (cidrRegex.test(value)) {
			return this.validateCIDR(value);
		}

		// Check for plain IP address (e.g., 192.168.1.1)
		const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
		if (ipRegex.test(value)) {
			return this.validateIP(value);
		}

		return false;
	}

	/**
	 * Validate IP address octets
	 */
	private validateIP(ip: string): boolean {
		const parts = ip.split('.');
		return parts.every(part => {
			const num = parseInt(part, 10);
			return num >= 0 && num <= 255;
		});
	}

	/**
	 * Validate CIDR notation
	 */
	private validateCIDR(cidr: string): boolean {
		const [ip, prefix] = cidr.split('/');
		
		if (!this.validateIP(ip)) {
			return false;
		}

		const prefixNum = parseInt(prefix, 10);
		return prefixNum >= 0 && prefixNum <= 32;
	}

	/**
	 * Helper function to add delay
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Compare two IP datasets to detect changes
	 */
	static compareIPData(oldData: ZoomIPData | null, newData: ZoomIPData): {
		hasChanges: boolean;
		added: string[];
		removed: string[];
		unchanged: number;
	} {
		if (!oldData) {
			return {
				hasChanges: true,
				added: newData.ips,
				removed: [],
				unchanged: 0,
			};
		}

		const oldSet = new Set(oldData.ips);
		const newSet = new Set(newData.ips);

		const added = newData.ips.filter(ip => !oldSet.has(ip));
		const removed = oldData.ips.filter(ip => !newSet.has(ip));
		const unchanged = newData.ips.filter(ip => oldSet.has(ip)).length;

		return {
			hasChanges: added.length > 0 || removed.length > 0,
			added,
			removed,
			unchanged,
		};
	}
}
