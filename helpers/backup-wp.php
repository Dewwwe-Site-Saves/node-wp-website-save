<?php
require_once('wp-config.php');
$DB_NAME = DB_NAME;
$DB_USER = DB_USER;
$DB_PASSWORD = DB_PASSWORD;
$DB_HOST_WP = DB_HOST;
$DB_HOST = str_replace(":3306", "", $DB_HOST_WP);

// echo "mysqldump --host={$DB_HOST} --user={$DB_USER} --password={$DB_PASSWORD} {$DB_NAME} > db_{$DB_NAME}.sql";

$execOutputValue = exec("(mysqldump --host={$DB_HOST} --user={$DB_USER} --password={$DB_PASSWORD} {$DB_NAME} --no-tablespaces > db_{$DB_NAME}.sql) 2>&1", $output, $result);

echo "<br />";
var_dump($result);
echo "<br />";
var_dump($output);
echo "<br />";
var_dump($execOutputValue);

echo "<p>All Good</p>"
?>
