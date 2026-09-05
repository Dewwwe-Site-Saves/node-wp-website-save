<?php
/**
 * Database dump endpoint, uploaded by Reposite next to wp-config.php for the
 * duration of one backup and removed right after.
 *
 * Authentication: the file .dewwwe-backup-token next to this script holds sha256(token);
 * the request carries the token itself in the X-Backup-Token header. Reading the token
 * file over HTTP therefore gives nothing usable. Any failed check answers 404 like a
 * missing page.
 *
 * On success: {"status":"ok","file":"db_<name>_<random>.sql","size":<bytes>}
 * On failure: {"status":"error","code":"exec_disabled"|"no_wp_config"|"mysqldump_failed","message":"..."}
 *
 * The script and the token file delete themselves once the token has been accepted,
 * whatever happens next.
 */

$tokenFile = __DIR__ . '/.dewwwe-backup-token';
$provided = $_SERVER['HTTP_X_BACKUP_TOKEN'] ?? '';

if ($provided === '' || !is_file($tokenFile)) {
    http_response_code(404);
    exit;
}
$expectedHash = trim((string) file_get_contents($tokenFile));
if ($expectedHash === '' || !hash_equals($expectedHash, hash('sha256', $provided))) {
    http_response_code(404);
    exit;
}

// Token accepted: from here on the endpoint is single use.
register_shutdown_function(function () use ($tokenFile) {
    @unlink($tokenFile);
    @unlink(__FILE__);
});
@unlink($tokenFile);

ignore_user_abort(true);
set_time_limit(0);

function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function fail(string $code, string $message): void
{
    respond(500, ['status' => 'error', 'code' => $code, 'message' => $message]);
}

if (!function_exists('exec')) {
    fail('exec_disabled', 'exec() is disabled on this host');
}

// wp-config.php lives next to the web root, or one level above it.
$wpConfig = null;
foreach ([__DIR__ . '/wp-config.php', dirname(__DIR__) . '/wp-config.php'] as $candidate) {
    if (is_readable($candidate)) {
        $wpConfig = $candidate;
        break;
    }
}
if ($wpConfig === null) {
    fail('no_wp_config', 'wp-config.php not found or not readable');
}

// SHORTINIT stops wp-settings.php after the core is loaded: no plugins, no theme, no output.
define('SHORTINIT', true);
require_once $wpConfig;

if (!defined('DB_NAME') || !defined('DB_USER') || !defined('DB_PASSWORD') || !defined('DB_HOST')) {
    fail('no_wp_config', 'wp-config.php does not define the database constants');
}

// DB_HOST may carry a port (host:3306) or a socket (host:/path/mysql.sock).
$host = DB_HOST;
$connection = '';
if (strpos($host, ':') !== false) {
    [$host, $extra] = explode(':', DB_HOST, 2);
    if (is_numeric($extra)) {
        $connection = ' --port=' . (int) $extra;
    } elseif ($extra !== '') {
        $connection = ' --socket=' . escapeshellarg($extra);
    }
}

$dumpFile = 'db_' . preg_replace('/[^A-Za-z0-9_-]/', '_', DB_NAME) . '_' . bin2hex(random_bytes(8)) . '.sql';
$dumpPath = __DIR__ . '/' . $dumpFile;

// The password goes through the environment, not the command line, so it never shows in ps.
putenv('MYSQL_PWD=' . DB_PASSWORD);
$cmd = 'mysqldump --host=' . escapeshellarg($host) . $connection
    . ' --user=' . escapeshellarg(DB_USER)
    . ' --single-transaction --quick --no-tablespaces'
    . ' --result-file=' . escapeshellarg($dumpPath)
    . ' ' . escapeshellarg(DB_NAME) . ' 2>&1';
exec($cmd, $output, $exitCode);
putenv('MYSQL_PWD');

if ($exitCode !== 0 || !is_file($dumpPath) || filesize($dumpPath) === 0) {
    @unlink($dumpPath);
    $last = $output === [] ? 'no output' : (string) end($output);
    fail('mysqldump_failed', 'mysqldump exited with code ' . (int) $exitCode . ': ' . substr($last, 0, 300));
}

respond(200, ['status' => 'ok', 'file' => $dumpFile, 'size' => filesize($dumpPath)]);
