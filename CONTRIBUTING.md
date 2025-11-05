# Contributing to CoinRuler

Thank you for your interest in contributing! Please follow these guidelines for a professional, maintainable codebase.

## Getting Started

1. **Clone the repo:**
   ```sh
   git clone https://github.com/your-org/CoinRuler.git
   cd CoinRuler
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Copy and configure your environment:**
   ```sh
   cp .env.example .env
   # Edit .env with your secrets
   ```

## Development Workflow

- **Lint:**
  ```sh
  npm run lint
  ```
- **Format:**
  ```sh
  npm run format
  ```
- **Test:**
  ```sh
  npm test
  ```
- **Run locally:**
  ```sh
  npm start
  ```

## Code Style
- All code must pass ESLint and Prettier checks before merging.
- Use 2 spaces for indentation, LF line endings, and single quotes (see `.editorconfig`).

## Pull Requests
- Fork the repo and create a feature branch.
- Write clear, descriptive commit messages.
- Add/maintain unit and integration tests for new features.
- Ensure all CI checks pass before requesting review.

## Reporting Issues
- Use GitHub Issues for bugs, feature requests, or questions.
- Provide as much detail as possible (logs, steps, screenshots).

## Security
- Never commit secrets or `.env` files.
- See `SECURITY.md` for credential rotation and best practices.

---

For questions, open an issue or contact a maintainer.
