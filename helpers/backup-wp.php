<?php
require_once('wp-config.php');
$DB_NAME = DB_NAME;
$DB_USER = DB_USER;
$DB_PASSWORD = DB_PASSWORD;
$DB_HOST = DB_HOST;
// echo "mysqldump --host={$DB_HOST} --user={$DB_USER} --password={$DB_PASSWORD} {$DB_NAME} > db_{$DB_NAME}.sql";
system("mysqldump --host={$DB_HOST} --user={$DB_USER} --password={$DB_PASSWORD} {$DB_NAME} > db_{$DB_NAME}.sql");
?>
