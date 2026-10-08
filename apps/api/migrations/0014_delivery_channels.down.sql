drop table if exists message_log;
drop table if exists push_devices;
alter table notification_prefs drop column if exists push;
alter table notification_prefs drop column if exists whatsapp;
alter table notification_prefs drop column if exists sms;
