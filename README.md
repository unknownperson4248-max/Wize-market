# Wize Market

Five tabs: Home, Messages, Post (+), Deals, Profile.

## Build and test

Use Node 22 or newer with node:sqlite.

```sh
node build.mjs
node server/test.mjs
```

The build emits index.html and dist/worker.mjs. The Worker serves the exact embedded HTML; no GitHub fetch is required per visit. Sources are app.js, base.css, app.css, body.html and server/worker.mjs.

## Cloudflare

Worker: wize-market-preview-2026. Existing D1 DB binding is retained. MEDIA binds the dedicated wize-market-media R2 bucket. Apply server/schema.sql once using the Cloudflare D1 SQL console before deployment. It only creates wm_ tables and indexes, preserving existing users and sessions. wrangler.jsonc contains public deployment configuration. Do not commit setup tokens, cookies or Google ID tokens.

Google Identity Services uses the existing public client ID. The deployed workers.dev origin must be an Authorized JavaScript Origin in that Google client. The backend verifies Google's RS256 signature, audience, issuer, expiration, verified email and login nonce. Session tokens are hashed in D1; cookies are HttpOnly, Secure and SameSite. Writes require the same Origin. Login and writes are rate limited.

## Permissions and owner setup

The private, single-use owner setup link is delivered only to the site owner. It binds the first verified Google account holding that capability to the owner role and invalidates the setup token. Do not put that link in this repository or share it. Existing users never automatically become owner. The owner finds a user with Home search, opens their profile and chooses Approve trusted admin. Trusted admins can create groups and moderate posts. Ordinary members can join existing groups but cannot create one. Public profiles never include email.

## Behavior

Posts and media are stored in D1/R2; posts require approval. Group posts and chat are membership protected. Images and videos remain private while pending. Photo limits: four images, 8 MB each. Video: one MP4 or WebM, 50 MB. Per-user daily uploads are limited to 200 MB.

Messages are participant-only. A new sender can send one request message until accepted. Mutual followers connect directly. The client polls visible conversations every four seconds. No push notifications are provided.

Deals start from approved public listings and accepted seller chats. An independent trusted admin, price and fixed BDT admin fee are part of the proposal. Both buyer and seller must confirm those terms. The selected admin then accepts to open the three-member room. Both participants must confirm completion before profile counts increase. Version checks prevent stale updates. Active deals can be disputed; proposals can be cancelled. This website does not process payments or verify receipt of money. Dispute resolution and payment integrations remain outside this implementation.

## Validation

server/test.mjs uses isolated in-memory SQLite and generated RSA keys, never production accounts. It verifies signature/audience/nonce/expiry, CSRF, permission boundaries, group membership, post moderation, request consent, follow behavior, private rooms, optimistic versioning and dual-party completion totals. Google account selection must be completed by the owner in their own browser; no password or Google account was used in automated tests.

## Group logos and post ranges

Group creation now requires only the group name and an image logo. The creator must own the uploaded image and must be owner/trusted on the server. A logo becomes publicly visible when assigned to a group; unassigned uploads remain private. Existing groups without logos retain their names and memberships.

Inside a group, Chat is independent of the post range selector. Members can view All posts, General posts or a selected price range without filtering chat messages. New groups start with BDT 0–5,000, 5,001–10,000 and 10,001+ post ranges. The group creator (while trusted) and the site owner can add or edit up to 20 ranges. Range edits that would move existing posts outside the new bounds are rejected. Game ID posts require a matching range; ordinary community posts can remain uncategorized. All group posts still require approval.

Migration server/migrations/002_group_ranges.sql has been applied to the existing deployment. It adds columns without deleting data, preserves legacy group caps as an initial range, and categorizes existing Game ID group posts. Run this migration once only on old databases. Fresh databases use the updated server/schema.sql.
