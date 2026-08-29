<?php
// Token-based authentication
$tokenFile = __DIR__ . '/.dewwwe-backup-token';
if (!file_exists($tokenFile)) { http_response_code(404); exit; }
$expectedToken = trim(file_get_contents($tokenFile));
$providedToken = $_GET['token'] ?? '';
if (!hash_equals($expectedToken, $providedToken)) { http_response_code(404); exit; }

// Token validated — delete it immediately
unlink($tokenFile);

// Load WordPress DB credentials
require_once('wp-config.php');
$dbHost = str_replace(':3306', '', DB_HOST);
$dbName = DB_NAME;

// Use token prefix in dump filename to prevent guessing
$dumpFile = 'db_' . $dbName . '_' . substr($expectedToken, 0, 16) . '.sql';
$dumpPath = __DIR__ . '/' . $dumpFile;

// Run mysqldump with properly escaped arguments
$cmd = sprintf(
    'mysqldump --host=%s --user=%s --password=%s %s --no-tablespaces > %s 2>&1',
    escapeshellarg($dbHost),
    escapeshellarg(DB_USER),
    escapeshellarg(DB_PASSWORD),
    escapeshellarg($dbName),
    escapeshellarg($dumpPath)
);
exec($cmd, $output, $result);

// Verify dump succeeded and file is not empty
$ok = ($result === 0 && file_exists($dumpPath) && filesize($dumpPath) > 0);

header('Content-Type: application/json');
if ($ok) {
    echo json_encode(['status' => 'ok', 'file' => $dumpFile]);
} else {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'file' => null]);
    // Clean up failed dump
    if (file_exists($dumpPath)) { unlink($dumpPath); }
}

// Self-delete this script
unlink(__FILE__);
?>
