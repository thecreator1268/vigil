-- One database per service: each service owns its schema and nothing else.
-- (Runs once, on first start of an empty pg_data volume.)
CREATE DATABASE checkin;
CREATE DATABASE trend;
CREATE DATABASE alerts;
CREATE DATABASE reminders;
CREATE DATABASE cases;
