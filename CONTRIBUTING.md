# Contributing to tapestry-registry

## How to contribute

1. Fork the repo and create a branch from `master`.
2. Make your changes. Add or update tests if relevant.
3. Ensure `npm test` passes.
4. Open a pull request against `master`.

## Development setup

```bash
npm ci
npm test     # 68 tests across 8 suites
npm start    # listens on :3002
```

The server entry point is `src/index.js`. Routes live in `src/routes/`.

## Coding standards

- Braces on every block -- no single-line `if` bodies.
- Express routes, SQLite via better-sqlite3, JWT auth.
- New endpoints need tests in `test/`.

## Reporting bugs

Use the [issue tracker](https://github.com/tapestry-mud/tapestry-registry/issues). Include the request, expected response, and actual response.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
