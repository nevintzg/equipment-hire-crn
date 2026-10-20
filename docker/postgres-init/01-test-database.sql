-- Runs once, on first container start.
-- Integration tests get their own database so they can truncate freely.
CREATE DATABASE eqhire_test OWNER eqhire;
