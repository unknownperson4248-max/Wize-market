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


## Listing deals and shared group posts

Run `server/migrations/009_listing_deals_and_crossposting.sql` once on an existing database before deploying this version. Fresh test databases use `server/schema.sql`. The migration adds stable sequential independent listing and deal numbers (displayed as `ID No - 1` and `Deal - 1`) and preserves old records.

Start Deal sends `POST /api/deals` with `postId`, without creating a Messenger conversation. The server snapshots the listing price and selects a seller Admin for direct deals, or an independent trusted admin for member listings. Direct requests start at `awaiting_admin`; mediated requests start at `awaiting_seller`, then move to `awaiting_admin` after seller consent. Only the assigned trusted admin can accept, reject or finally cancel. Members may submit a reasoned cancellation request, which leaves the deal open until the admin decides. Buyer and seller confirm completion, then the assigned Admin gives the final confirmation. A direct Seller/Admin may use a separate, explicit second confirmation with an audit reason when the buyer has not confirmed. `/api/deal-management` and the control room show metadata to the owner (all deals) or assigned trusted admins. Room messages are participant-only.

Public posts may include up to 20 joined `groupIds`. There is one underlying listing, moderation decision and set of reactions. Each group placement receives its own matching price range. Destination selection is fixed during editing; price edits recalculate the existing placements. Group-only posts remain supported.

Prices above 9,999 display in k automatically; explicit k display is available for lower amounts. Friend requests immediately follow the target; accepted requests appear in Friends. Profile connections require sign-in; received requests remain private to their recipient.

Validation: `node server/test.mjs`, `node build.mjs`.


## Admin-controlled deal lifecycle

For databases already on migration 009, apply `server/migrations/010_admin_deal_permissions.sql` before deploying this version. It preserves listing/deal counter rows and UUID foreign keys, backfills an immutable account-name snapshot, adds cancellation requests, and moves any older mediated requests missing seller consent back to `awaiting_seller`.

Only the assigned current trusted Admin can accept, reject, cancel, decide cancellation requests or resolve disputes. Buyer and seller can request cancellation and each confirm completion; mediated deals also require the assigned Admin final confirmation. Direct Seller/Admin completion supports the explicit audited override described below. Disputes clear previous completion flags. The assigned Admin may resume a disputed deal or cancel it; resuming requires fresh completion confirmations. Completed/cancelled deals are immutable and their opened rooms are read-only.

Deal Management supports All/Pending/Active/Completed/Cancelled/Disputed filters and qualified serial searches (`ID No - 1`, `Deal - 1`), including legacy WM/DL search aliases. The owner can inspect all metadata and non-chat audit history. Private messages remain limited to participants and the assigned trusted Admin.

Chat inputs use explicit LTR direction. Polling updates message containers without replacing the input or its selection. Messages preserve the submitted character order, with timestamps and deal participant roles. The mobile room uses the visual viewport for keyboard resizing.

Verified locally with `node server/test.mjs` and the additive migration against the preceding schema. An uploaded Cloudflare version bound to an isolated QA D1 database also exercises real Buyer/Seller/Admin sessions, native Chromium text insertion, 320px layout, backend authorization, cancellations, disputes, dual completion and audit/search behavior. QA sessions and fixtures are never inserted into the production database.


## Public feed, final completion and profile save

Apply `server/migrations/011_completion_profile_and_guest_views.sql` after 010, before deploying this revision. Existing completed statuses, identifiers and counter mappings remain intact. Historical completion dates are backfilled; historical records are not marked as newly Admin-confirmed. Unresolved cancellation requests attached to terminal records are closed without deleting their reasons.

Guest visitors can browse Home and public listings. Visible posts record a deduplicated view immediately, using the existing account identity or an opaque HttpOnly visitor cookie. Private profiles, messages, deals, saves and posting still require authentication. Views and the bookmark are displayed beside the listing price.

Buyer/Seller completion moves a mediated deal to `awaiting_final`. Only the assigned current trusted Admin can finalize it. Completed and cancelled records are excluded from the default ongoing list; Previous deals includes completed totals by responsible Admin and counterparties. Direct Seller/Admin deals support two distinct server-checked actions: confirm seller completion, then explicitly finalize with an acknowledgement and reason if the buyer has not confirmed. Pending cancellation requests and disputes must be resolved before finalization.

Deal messages display public profile pictures and authoritative verification badges. The profile editor saves name, bio, picture, banner and optional username in one atomic operation from one final Save button. A database trigger and API checks enforce seven days between username changes; saving the unchanged username does not restart the timer. Edit and Sign out are in the own-profile menu.

Validation includes local permission, migration, guest view deduplication, direct double-confirmation, atomic username cooldown tests and an isolated Cloudflare mobile-browser workflow covering guest browsing/login gates, immediate views, bookmark placement, single-save profile editing, participant badges, final Admin completion and completed history totals.
