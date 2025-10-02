import { Env, APIResponse, AccountSelectionRequest, ManualUpdateRequest } from './types';
import { WARPProfileManager } from './services/warpProfileManager';

/**
 * Main Cloudflare Worker entry point
 */
export default {
	/**
	 * Handle HTTP requests (API endpoints)
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		console.log(`${method} ${path}`);

		try {
			const manager = new WARPProfileManager(env);

			// Route handling
			switch (true) {
				case path === '/' && method === 'GET':
					return handleWebUI(env, request);
				
				case path === '/api' && method === 'GET':
					return handleRoot();

				case path === '/status' && method === 'GET':
					return await handleStatus(manager);

				case path === '/accounts' && method === 'GET':
					return await handleGetAccounts(manager);

				case path === '/accounts/select' && method === 'POST':
					return await handleSelectAccount(manager, request);

				case path === '/accounts/selected' && method === 'GET':
					return await handleGetSelectedAccount(manager);

				case path === '/profiles' && method === 'GET':
					return await handleGetProfiles(manager);

				case path === '/update' && method === 'POST':
					return await handleUpdate(manager, request);

				case path === '/history' && method === 'GET':
					return await handleGetHistory(manager, url);

				case path === '/reset' && method === 'POST':
					return await handleReset(manager);

				default:
					return createErrorResponse('Not Found', 404);
			}

		} catch (error) {
			console.error('Request handling error:', error);
			return createErrorResponse(
				error instanceof Error ? error.message : 'Internal Server Error',
				500
			);
		}
	},

	/**
	 * Handle scheduled events (cron triggers)
	 */
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log('Scheduled event triggered:', event.cron);

		try {
			const manager = new WARPProfileManager(env);

			// Check if update is needed
			const updateNeeded = await manager.isUpdateNeeded();
			
			if (updateNeeded) {
				console.log('Update needed, starting WARP profile update...');
				const result = await manager.performUpdate();
				
				if (result.success) {
					console.log(`Scheduled update completed: ${result.profiles_updated} profiles updated`);
				} else {
					console.error(`Scheduled update failed: ${result.errors.join(', ')}`);
				}
			} else {
				console.log('Update not needed, skipping...');
			}

		} catch (error) {
			console.error('Scheduled event error:', error);
			// Don't throw - we don't want to fail the scheduled event
		}
	}
};

/**
 * Handle web UI - serve the frontend
 */
async function handleWebUI(env: Env, request: Request): Promise<Response> {
	// Serve the HTML frontend from assets
	try {
		return await env.ASSETS.fetch(request);
	} catch (error) {
		// Fallback if assets are unavailable
		return new Response(`<!DOCTYPE html>
<html><head><title>Zoom WARP Manager</title></head>
<body style="font-family: sans-serif; padding: 40px; text-align: center;">
<h1>Zoom WARP Manager</h1>
<p>Web UI is loading... If this persists, access the API directly at <a href="/api">/api</a></p>
</body></html>`, {
			headers: { 'Content-Type': 'text/html' }
		});
	}
}

/**
 * Handle root endpoint - basic info
 */
function handleRoot(): Response {
	const info = {
		name: 'Zoom WARP Manager',
		version: '1.0.0',
		description: 'Automatically update Cloudflare Zero Trust WARP profiles with Zoom IP ranges',
		endpoints: {
			'GET /': 'This information',
			'GET /status': 'Get system status and statistics',
			'GET /accounts': 'List all available Cloudflare accounts',
			'POST /accounts/select': 'Select an account for WARP profile management',
			'GET /accounts/selected': 'Get currently selected account',
			'GET /profiles': 'List WARP profiles for selected account',
			'POST /update': 'Manually trigger update (optional: account_id, force_fetch)',
			'GET /history': 'Get update history (optional: ?limit=10)',
			'POST /reset': 'Reset all data (dangerous)'
		},
		scheduled: 'Automatic updates via cron trigger (daily at 3 AM UTC)',
		zoom_source: 'https://assets.zoom.us/docs/ipranges/ZoomMeetings.txt'
	};

	return createSuccessResponse(info);
}

/**
 * Handle status endpoint
 */
async function handleStatus(manager: WARPProfileManager): Promise<Response> {
	const status = await manager.getStatus();
	return createSuccessResponse(status);
}

/**
 * Handle get accounts
 */
async function handleGetAccounts(manager: WARPProfileManager): Promise<Response> {
	const accounts = await manager.getAccounts();
	return createSuccessResponse({
		accounts,
		count: accounts.length
	});
}

/**
 * Handle select account
 */
async function handleSelectAccount(manager: WARPProfileManager, request: Request): Promise<Response> {
	try {
		const body = await request.json() as AccountSelectionRequest;
		
		if (!body.account_id) {
			return createErrorResponse('account_id is required', 400);
		}

		await manager.selectAccount(body.account_id);
		
		return createSuccessResponse({
			message: 'Account selected successfully',
			account_id: body.account_id
		});

	} catch (error) {
		return createErrorResponse(
			error instanceof Error ? error.message : 'Invalid request',
			400
		);
	}
}

/**
 * Handle get selected account
 */
async function handleGetSelectedAccount(manager: WARPProfileManager): Promise<Response> {
	const account = await manager.getSelectedAccount();
	
	if (!account) {
		return createErrorResponse('No account selected', 404);
	}

	return createSuccessResponse(account);
}

/**
 * Handle get profiles
 */
async function handleGetProfiles(manager: WARPProfileManager): Promise<Response> {
	const account = await manager.getSelectedAccount();
	
	if (!account) {
		return createErrorResponse('No account selected. Please select an account first.', 400);
	}

	// We need to access the CloudflareAPI service through the manager
	// For now, return a message to use the status endpoint
	return createSuccessResponse({
		message: 'Use /status endpoint to see WARP profiles count',
		account_id: account.id,
		account_name: account.name
	});
}

/**
 * Handle update
 */
async function handleUpdate(manager: WARPProfileManager, request: Request): Promise<Response> {
	try {
		let accountId: string | undefined;
		let forceFetch = false;

		// Try to parse JSON body if present
		if (request.headers.get('content-type')?.includes('application/json')) {
			try {
				const body = await request.json() as ManualUpdateRequest;
				accountId = body.account_id;
				forceFetch = body.force_fetch || false;
			} catch {
				// No body or invalid JSON, use defaults
			}
		}

		const result = await manager.performUpdate(accountId, forceFetch);
		return createSuccessResponse(result);

	} catch (error) {
		return createErrorResponse(
			error instanceof Error ? error.message : 'Update failed',
			500
		);
	}
}

/**
 * Handle get history
 */
async function handleGetHistory(manager: WARPProfileManager, url: URL): Promise<Response> {
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? parseInt(limitParam) : 10;

	const history = await manager.getUpdateHistory(limit);
	
	return createSuccessResponse({
		history,
		count: history.length
	});
}

/**
 * Handle reset
 */
async function handleReset(manager: WARPProfileManager): Promise<Response> {
	await manager.reset();
	return createSuccessResponse({ message: 'System reset completed' });
}

/**
 * Create success response
 */
function createSuccessResponse<T>(data: T): Response {
	const response: APIResponse<T> = {
		success: true,
		data,
		metadata: {
			timestamp: new Date().toISOString(),
			processing_time_ms: 0,
			version: '1.0.0'
		}
	};

	return new Response(JSON.stringify(response, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization'
		}
	});
}

/**
 * Create error response
 */
function createErrorResponse(message: string, status: number = 500): Response {
	const response: APIResponse = {
		success: false,
		error: {
			code: status.toString(),
			message
		},
		metadata: {
			timestamp: new Date().toISOString(),
			processing_time_ms: 0,
			version: '1.0.0'
		}
	};

	return new Response(JSON.stringify(response, null, 2), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization'
		}
	});
}
