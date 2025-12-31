# Test Fixtures

This directory contains sanitized sample emails for testing.

## Structure

```
test/fixtures/
├── emails/
│   ├── school-newsletter.eml
│   ├── ics-attachment.eml
│   ├── ambiguous-event.eml
│   └── signupgenius.eml
└── configs/
    ├── minimal-config.yaml
    └── full-config.yaml
```

## Adding Fixtures

When adding test fixtures:

1. **Sanitize all PII**: Remove real names, emails, addresses
2. **Use example domains**: `example.edu`, `example.com`
3. **Include metadata**: Comment at top explaining what the fixture tests
4. **Multiple scenarios**: Cover success, edge cases, and failures

## Example

```eml
# Fixture: School newsletter with ICS attachment
# Tests: ICS extraction, confidence scoring
# Expected: 1 event extracted with 0.95 confidence

From: principal@example.edu
Subject: May Calendar - Early Release Days
Date: Mon, 01 May 2025 09:00:00 -0700

[Email content here...]
```
