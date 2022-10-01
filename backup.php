<?
$date = date('dmYYYY');
system("mysqldump --host=efyzfyg220.mysql.db --user=efyzfyg220 --password=cm8xR8JpcYZx efyzfyg220 > database_backup".$date.".sql");
?>