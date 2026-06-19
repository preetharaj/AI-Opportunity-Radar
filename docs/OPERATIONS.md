# Operations Guide

## Check Subscribers

Use:

/api/admin/subscribers

or query Turso directly.

## Test Notifications

```bash
curl -X POST https://mapd.cc/api/notify -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Verify Subscription

Subscribe via UI and confirm record exists in Turso.

## Newsletter Schedule

- Cron runs daily
- Digest sent biweekly
- Deadline reminders sent only when thresholds match

## Common Checks

- Turso connectivity
- Resend delivery
- Umami analytics
- Notification logs

## Opportunity Maintenance

- Add opportunities
- Archive expired opportunities
- Verify deadlines
- Verify official source links
