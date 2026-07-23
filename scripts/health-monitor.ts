#!/usr/bin/env npx tsx
/**
 * Lightweight Health Monitor
 *
 * Fast health checks for continuous monitoring via `watch -n 60` or cron.
 * Outputs both human-readable and machine-parseable formats.
 *
 * Usage:
 *   npx tsx scripts/health-monitor.ts [environment] [options]
 *
 * Environments:
 *   test    - https://checklist-test.rkroll.com
 *   prod    - https://checklist-app.rkroll.com (default)
 *   local   - http://localhost:5173
 *
 * Options:
 *   --json          Output JSON only (for machine parsing)
 *   --quiet         Suppress OK messages, only show failures
 *   --alert <cmd>   Run command on failure (e.g., --alert "notify-send 'Alert!'")
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 *   2 - Configuration/runtime error
 *
 * Examples:
 *   watch -n 60 'npx tsx scripts/health-monitor.ts prod'
 *   npx tsx scripts/health-monitor.ts prod --json | jq .
 *   npx tsx scripts/health-monitor.ts test --alert "curl -X POST https://hooks.slack.com/..."
 */

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  responseTime?: number;
  details?: Record<string, unknown>;
}

interface MonitorResult {
  timestamp: string;
  environment: string;
  baseUrl: string;
  duration: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: CheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

// Environment configurations
const ENVIRONMENTS: Record<
  string,
  { appUrl: string; backendUrl: string; apiPrefix: string; rowboatUrl: string }
> = {
  prod: {
    appUrl: 'https://checklist-app.rkroll.com',
    backendUrl: 'https://checklist-app.rkroll.com',
    apiPrefix: '/api',
    rowboatUrl: 'https://rowboat.rkroll.com',
  },
  test: {
    appUrl: 'https://checklist-test.rkroll.com',
    backendUrl: 'https://checklist-test.rkroll.com',
    apiPrefix: '/api',
    rowboatUrl: 'https://rowboat.rkroll.com',
  },
  local: {
    appUrl: 'http://localhost:8765',
    backendUrl: 'http://localhost:3001',
    apiPrefix: '/api', // Backend routes still use /api/ prefix
    rowboatUrl: 'http://localhost:3020',
  },
};

// Thresholds
const THRESHOLDS = {
  apiResponse: 2000, // 2 seconds
  pageLoad: 5000, // 5 seconds
  warnResponse: 1000, // 1 second (warn if slower)
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function colorize(text: string, color: keyof typeof colors): string {
  // Disable colors if not a TTY or NO_COLOR is set
  if (!process.stdout.isTTY || process.env.NO_COLOR) {
    return text;
  }
  return `${colors[color]}${text}${colors.reset}`;
}

async function checkEndpoint(
  name: string,
  url: string,
  options: {
    expectedStatus?: number[];
    timeout?: number;
    validateJson?: (data: unknown) => { valid: boolean; message?: string };
    headers?: Record<string, string>;
  } = {}
): Promise<CheckResult> {
  const { expectedStatus = [200], timeout = THRESHOLDS.apiResponse, validateJson, headers = {} } = options;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (!expectedStatus.includes(response.status)) {
      return {
        name,
        status: 'fail',
        message: `HTTP ${response.status} (expected ${expectedStatus.join('/')})`,
        responseTime,
      };
    }

    // Validate JSON response if validator provided
    if (validateJson && response.headers.get('content-type')?.includes('json')) {
      try {
        const data = await response.json();
        const validation = validateJson(data);
        if (!validation.valid) {
          return {
            name,
            status: 'fail',
            message: validation.message || 'Invalid response',
            responseTime,
            details: data as Record<string, unknown>,
          };
        }
        return {
          name,
          status: responseTime > THRESHOLDS.warnResponse ? 'warn' : 'pass',
          message:
            responseTime > THRESHOLDS.warnResponse
              ? `Slow (${responseTime}ms)`
              : `OK (${responseTime}ms)`,
          responseTime,
          details: data as Record<string, unknown>,
        };
      } catch {
        return {
          name,
          status: 'fail',
          message: 'Invalid JSON response',
          responseTime,
        };
      }
    }

    return {
      name,
      status: responseTime > THRESHOLDS.warnResponse ? 'warn' : 'pass',
      message:
        responseTime > THRESHOLDS.warnResponse
          ? `Slow (${responseTime}ms)`
          : `OK (${responseTime}ms)`,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? `Timeout (>${timeout}ms)`
          : error.message
        : 'Unknown error';

    return {
      name,
      status: 'fail',
      message,
      responseTime,
    };
  }
}

async function checkHtmlPage(name: string, url: string): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), THRESHOLDS.pageLoad);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.status !== 200) {
      return {
        name,
        status: 'fail',
        message: `HTTP ${response.status}`,
        responseTime,
      };
    }

    const html = await response.text();

    // Check for critical elements
    if (!html.includes('<title>') || !html.includes('<script')) {
      return {
        name,
        status: 'fail',
        message: 'Missing critical HTML elements',
        responseTime,
      };
    }

    return {
      name,
      status: responseTime > THRESHOLDS.warnResponse ? 'warn' : 'pass',
      message:
        responseTime > THRESHOLDS.warnResponse
          ? `Slow (${responseTime}ms)`
          : `OK (${responseTime}ms)`,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? `Timeout (>${THRESHOLDS.pageLoad}ms)`
          : error.message
        : 'Unknown error';

    return {
      name,
      status: 'fail',
      message,
      responseTime,
    };
  }
}

async function runHealthChecks(env: string): Promise<MonitorResult> {
  const config = ENVIRONMENTS[env];
  if (!config) {
    throw new Error(`Unknown environment: ${env}. Use: ${Object.keys(ENVIRONMENTS).join(', ')}`);
  }

  const startTime = Date.now();
  const checks: CheckResult[] = [];

  // Origin header required by backend CORS
  const apiHeaders = { Origin: config.appUrl };
  const apiBase = `${config.backendUrl}${config.apiPrefix}`;

  // Run checks in parallel for speed
  const checkPromises = [
    // 1. Frontend loads
    checkHtmlPage('Frontend', config.appUrl),

    // 2. Backend health (health endpoint is at /health, not /api/health)
    checkEndpoint('API Health', `${config.backendUrl}/health`, {
      headers: apiHeaders,
      validateJson: (data) => {
        const health = data as { status?: string; features?: { sharing?: boolean; billing?: boolean } };
        if (health.status !== 'ok') {
          return { valid: false, message: `Status: ${health.status}` };
        }
        return { valid: true };
      },
    }),

    // 3. Auth system - check session endpoint responds (null = not logged in, which is OK)
    checkEndpoint('Auth Session', `${apiBase}/auth/get-session`, {
      headers: apiHeaders,
      expectedStatus: [200],
    }),

    // 4. Billing tiers endpoint (public, doesn't require auth)
    checkEndpoint('Billing', `${apiBase}/billing/tiers`, {
      headers: apiHeaders,
      expectedStatus: [200],
    }),

    // 5. Hosted rowboat data plane - confirm the sync server is reachable at all
    // (DNS + TLS + responding). We accept any non-5xx: the bare origin isn't a routed
    // endpoint, so its exact status is not a contract we want to assert here.
    checkEndpoint('Rowboat Sync', config.rowboatUrl, {
      expectedStatus: [200, 401, 403, 404],
      timeout: 3000,
    }),
  ];

  const results = await Promise.all(checkPromises);
  checks.push(...results);

  const duration = Date.now() - startTime;

  // Calculate summary
  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'pass').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    warnings: checks.filter((c) => c.status === 'warn').length,
  };

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (summary.failed > 0) {
    status = 'unhealthy';
  } else if (summary.warnings > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return {
    timestamp: new Date().toISOString(),
    environment: env,
    baseUrl: config.appUrl,
    duration,
    status,
    checks,
    summary,
  };
}

function formatHumanOutput(result: MonitorResult, quiet: boolean): string {
  const lines: string[] = [];

  // Header
  const statusIcon =
    result.status === 'healthy' ? colorize('OK', 'green') :
    result.status === 'degraded' ? colorize('WARN', 'yellow') :
    colorize('FAIL', 'red');

  lines.push('');
  lines.push(
    `${colorize('CheckList Health Monitor', 'bright')} - ${result.environment.toUpperCase()}`
  );
  lines.push(colorize(`${result.baseUrl}`, 'dim'));
  lines.push('');
  lines.push(`Status: ${statusIcon}  |  Time: ${result.timestamp}  |  Duration: ${result.duration}ms`);
  lines.push('');

  // Check results
  lines.push(colorize('Checks:', 'bright'));

  for (const check of result.checks) {
    if (quiet && check.status === 'pass') continue;

    const icon =
      check.status === 'pass' ? colorize('[PASS]', 'green') :
      check.status === 'warn' ? colorize('[WARN]', 'yellow') :
      colorize('[FAIL]', 'red');

    lines.push(`  ${icon} ${check.name}: ${check.message}`);

    // Show details for health check
    if (check.details && check.name === 'API Health') {
      const features = (check.details as { features?: { sharing?: boolean; billing?: boolean } }).features;
      if (features) {
        lines.push(
          colorize(`         Sharing: ${features.sharing ? 'enabled' : 'disabled'}, Billing: ${features.billing ? 'enabled' : 'disabled'}`, 'dim')
        );
      }
    }
  }

  // Summary
  lines.push('');
  lines.push(
    `Summary: ${colorize(String(result.summary.passed), 'green')} passed, ` +
    `${colorize(String(result.summary.warnings), 'yellow')} warnings, ` +
    `${colorize(String(result.summary.failed), 'red')} failed`
  );
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let env = 'prod';
  let jsonOutput = false;
  let quiet = false;
  let alertCmd: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--quiet') {
      quiet = true;
    } else if (arg === '--alert' && args[i + 1]) {
      alertCmd = args[++i];
    } else if (!arg.startsWith('-')) {
      env = arg;
    }
  }

  try {
    const result = await runHealthChecks(env);

    // Output results
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatHumanOutput(result, quiet));
    }

    // Run alert command if there are failures
    if (alertCmd && result.status === 'unhealthy') {
      const { exec } = await import('node:child_process');
      exec(alertCmd, (error) => {
        if (error) {
          console.error(`Alert command failed: ${error.message}`);
        }
      });
    }

    // Exit with appropriate code
    process.exit(result.status === 'unhealthy' ? 1 : 0);
  } catch (error) {
    if (!jsonOutput) {
      console.error(colorize(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red'));
    } else {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
    process.exit(2);
  }
}

main();
