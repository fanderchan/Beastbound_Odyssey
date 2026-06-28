# Beastbound Odyssey MySQL 9.7

Phase158 adds the first backend migration target:

- `001_auth_schema.sql`

It covers account login, sessions, player profile binding, GM user grants, GM command grants, GM command audit, and auth events. The running Node prototype still uses memory or JSON storage first; this SQL is the intended MySQL shape before the real database adapter lands.
