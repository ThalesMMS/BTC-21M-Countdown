# Contributing

Thanks for helping improve 21M Countdown.

## Scope
This repo is a small static TypeScript app. Please keep changes focused, easy to review, and grounded in the current goal of the project.

## Before you open a pull request
1. Install dependencies with `npm ci`
2. Run `npm run build`
3. Run `npm run typecheck`
4. Confirm `index.html`, `style.css`, and the generated `script.js` still work together

## Good contributions
- Fix calculation, display, or data-fetching bugs
- Improve clarity in the UI copy or README
- Tighten reliability around mempool.space API usage
- Add small, relevant tests or validation when practical

## Please avoid
- Unrelated refactors
- Large dependency churn
- Speculative product rewrites
- Committing secrets, API keys, wallet data, or personal information

## Issues
- Use the bug report form for verified problems
- Use the feature request form for small, concrete improvements
- Use `SECURITY.md` instead of public issues for sensitive security reports
