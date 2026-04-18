# Support

## Where to ask for help
- **Bug reports:** use the [bug report issue form](https://github.com/ThalesMMS/BTC-21M-Countdown/issues/new?template=bug_report.yml)
- **Feature ideas:** use the [feature request form](https://github.com/ThalesMMS/BTC-21M-Countdown/issues/new?template=feature_request.yml)
- **Security concerns:** follow [SECURITY.md](SECURITY.md) and keep sensitive reports private

## Quick FAQ

### Why does the countdown not end at exactly 21,000,000 BTC?
Because Bitcoin block rewards are integer satoshi values and halvings round down. Total issuance ends slightly below 21 million BTC.

### Why can the projected date change?
The UI uses live chain height plus a simplified 10-minute block assumption. Real block production is probabilistic and difficulty changes over time.

### Why might the page look broken from a fresh checkout?
Run `npm ci` and `npm run build` first so `script.js` exists before opening `index.html` directly.

## Announcements
This repo does not currently use GitHub Discussions or a dedicated announcements channel. For now, project updates should live in pull requests, issues, and the README.
