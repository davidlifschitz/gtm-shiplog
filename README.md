# ShipLog

Paste `git log`, a CHANGELOG, or a pile of PR titles. Get grouped, specific release notes. Nothing is uploaded.

Ask this answers: [Ask HN: If you write release notes, what stops you from being specific?](https://news.ycombinator.com/item?id=49367131)

- No account
- No upload
- Cap: 400 KB of text
- Conventional commits, git oneline, Keep a Changelog, ticket prefixes
- Generic filler ("bug fixes and performance improvements") is flagged, not copied

## Local

Open `index.html` in a browser, or:

```bash
python3 -m http.server 4173
```

## GTM

Reply to people who still paste Slack-style filler because the real context is in commits. Copy is in the page footer.
