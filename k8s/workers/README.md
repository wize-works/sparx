# Background Workers

Pub/Sub consumers — one Deployment per logical worker, one Pub/Sub subscription per topic-to-consumer pair.

| Worker            | Subscribes to                         | Purpose                                          |
| ----------------- | ------------------------------------- | ------------------------------------------------ |
| `worker-email`    | `email.send`                          | Render React Email + send via Postal             |
| `worker-domain`   | `domain.purchased`, `domain.verified` | CNAME validation + post-purchase DNS config      |
| `worker-dropship` | (cron + `dropship.sync`)              | Pull supplier catalog updates                    |
| `worker-billing`  | Stripe webhook fan-out topic          | Process invoice paid / subscription updated      |
| `worker-webhook`  | `*` (subset)                          | Dispatch outbound webhooks to merchant endpoints |

## Pub/Sub subscriptions

The topics are created in Terraform; subscriptions are created here (one per worker, with the worker name in the subscription name for traceability). Add them with `gcloud` or via a small Terraform follow-up:

```powershell
gcloud pubsub subscriptions create email.send.worker-email `
  --topic=email.send `
  --ack-deadline=60 `
  --message-retention-duration=7d
```

## Adding a worker

Same pattern as apps:

1. Copy `worker-email.example.yaml` to `<name>.yaml`
2. Replace `worker-email` and `email.send` references
3. Add to `kustomization.yaml`
4. Create the Pub/Sub subscription
