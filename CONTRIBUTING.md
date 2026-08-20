# Contributing

Thanks for helping improve `pi-agent-profiles`. This project is in beta; please open an issue before proposing a large behavioral change.

## Local setup

1. Use Node.js 22.19.0 or newer.
2. Clone the repository and run `npm ci`.
3. Run the focused tests you change with `npm test -- <path>` when useful.
4. Before opening a pull request, run:

   ```bash
   npm run check
   npm run typecheck
   npm run pack:dry-run
   ```

## Changes

- Use Conventional Commit messages, such as `feat: add profile import` or `fix: preserve active route`.
- Include tests for behavior changes and update documentation when user-facing behavior changes.
- Do not commit generated artifacts, credentials, tokens, private configuration, or other secrets.
- Keep changes focused and explain any compatibility impact in the pull request.

## Attribution and licensing

The project is MIT licensed. Preserve existing MIT license text, copyright notices, and third-party attribution, including the notices in `THIRD_PARTY_NOTICES.md`, when adapting or moving code.
