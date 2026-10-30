# Wize Market

Five tabs: Home, Messages, Post (+), Deals, Profile.

## Sell / Need posts and notifications

Apply `server/migrations/017_need_posts_notifications.sql` once to databases already on migration 016 before deploying this revision. The additive migration keeps old posts as Sell posts and retains existing accounts, media, conversations, deal references and independent listing/deal counters. It does not backfill historical notification alerts.

The Post button opens an animated Sell / Need chooser. Need posts require only a title; optional photos, budget, category, details and a longer description use the existing upload and safety pipeline. Their only contact action is Message Buyer. The seller can propose a referenced Need deal from the accepted private conversation; the buyer cannot initiate it. Existing Admin permissions, acceptance, confirmation and completion rules apply.

Notification history and per-user category preferences live in D1. Source-table triggers create deduplicated friend, request, private/group message and deal notifications in the same transaction as each event. The header bell shows the persisted unread count (99+ above 99), supports individual/all read actions, and links to the relevant profile, request, chat or deal. Muted events remain in history without badges; unmute applies to future events. Visible pages poll a compact count endpoint every 15 seconds; hidden pages pause polling. No sounds are played.

Admin Panel → Website & app → App name & description controls the website header/title/description and install manifest using the same owner-only settings. Gallery photos start loading ahead of lazy thumbnails, reuse authenticated in-memory image requests, and retain access checks for private media.

Validation: `node build.mjs` and `node server/test.mjs`. Tests use isolated Buyer, Seller, trusted Admin, Owner and normal-member fixtures, including API permission bypass attempts, notification transaction rollback, migration preservation, read/mute persistence, pagination and HTML escaping for branding.

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

Guest visitors can browse Home and public listings. Visible posts record a deduplicated view immediately, using the existing account identity or an opaque HttpOnly visitor cookie. Private profiles, messages, deals, saves and posting still require authentication. Views share the Like / Comment / Share reaction row; Save is in the post three-dot menu.

Buyer/Seller completion moves a mediated deal to `awaiting_final`. Only the assigned current trusted Admin can finalize it. Completed and cancelled records are excluded from the default ongoing list; Previous deals includes completed totals by responsible Admin and counterparties. Direct Seller/Admin deals support two distinct server-checked actions: confirm seller completion, then explicitly finalize with an acknowledgement and reason if the buyer has not confirmed. Pending cancellation requests and disputes must be resolved before finalization.

Deal messages display public profile pictures and authoritative verification badges. The profile editor saves name, bio, picture, banner and optional username in one atomic operation from one final Save button. A database trigger and API checks enforce seven days between username changes; saving the unchanged username does not restart the timer. Edit and Sign out are in the own-profile menu.

Validation includes local permission, migration, guest view deduplication, direct double-confirmation, atomic username cooldown tests and an isolated Cloudflare mobile-browser workflow covering guest browsing/login gates, immediate views, bookmark placement, single-save profile editing, participant badges, final Admin completion and completed history totals.


## Feed preferences and profile drawer

Apply `server/migrations/012_personal_post_preferences.sql` after 011. `POST /api/posts/:id/interest` records an account-scoped Not interested preference; Home and group feeds exclude every copy of that listing for that member. Other viewers and the underlying listing are unchanged. Guest Not interested preferences remain local to their browser. Saved posts remain separately accessible.

Post menus contain Save/Unsave, Not interested and Report post, with owner editing and the existing profile-share action retained where applicable. The reactions row displays Like, Comment, Share and Views together. The centered profile hero has a compact banner and a three-line toggle at its top left, opening a dismissible keyboard-accessible left drawer for profile actions. The old profile three-dot location is removed.

Validated with local per-account feed preference tests and isolated mobile browser checks for menu persistence, guest preferences, duplicate Save state, four aligned reactions, centered avatar/compact spacing, drawer focus/escape behavior and the existing single-save editor.

## Phone install, member access and Messenger deals

The public site is an installable PWA: `/manifest.webmanifest`, PNG icons (including a maskable icon), standalone launch and `/sw.js`. First visits show an Install suggestion; supported browsers use their native install prompt, while Safari/iPhone and other browsers receive home-screen installation instructions. Installed launches hide the suggestion. The service worker caches only public install icons and an offline notice; account pages, APIs, chats and media are never stored in its cache. This is a website-installed app, with no APK or app-store package.

Apply additive migration `013_member_permissions.sql` after 012. Only the owner can search member sign-in email addresses or change their posting, messaging and new-deal permissions. Role, blue verification and trusted-seller controls remain separate, and owner access is protected. Capability restrictions are checked at the API, leaving existing deal status, confirmation and dispute actions accessible. Emails remain absent from public profiles, feed data and chat identities. The control-room Reports label is shortened.

The former bottom Deals destination is Features: public completed-trade profiles, community group discovery and app installation. Messages contains a separate Deals tab in place of Other group, with exactly three views: Ongoing, Previous and Website total. Ongoing deals use compact conversation cards; details and controls expand on demand. The existing assigned-Admin acceptance, completion and dispute rules are unchanged. Completed/cancelled records have their own Previous view. `/api/deals/public` exposes only completed serials, public participant identities and completion dates, with pagination; it does not return prices, emails, cancellation reasons, history or private messages. Group/private chat messages now include sender portraits, names and actual blue verification badges.

Validation: API regression suite, owner-only email/capability tests, restriction bypass attempts, safe public-summary tests, service-worker private-cache exclusion tests, and isolated 320px/390px Chromium checks of install handling, mobile layouts, group identity and the Messenger Deal views. Physical iPhone/Android installation still follows each device browser's own install UI.

## Inbox controls, blocking, chat info and PWA branding

Apply `014_inbox_blocks_pwa.sql` after 013. All chat includes personal conversations and joined groups; My group is removed. Each conversation has an always-visible three-dot menu with Archive, Delete and Block (group admins can archive/delete their own inbox copy, and use group Mute). Archived and blocked conversations are accessible from Messenger options and can be restored. Deletion clears only the viewer's messages up to their deletion point, preserving other members' copies and all deal records. New messages can bring a deleted chat back, showing only messages after that point.

Private blocking is symmetric for new messages, chat requests, follows, friend requests and new deals, enforced at the API. It also removes friendship/follow relationships and hides the blocker's feed copies from that author. Existing secure deal rooms and Admin resolution access remain available. Blocking a group hides it from the inbox and prevents joining, reading or posting until the member unblocks it. Blocked members can be managed even without an inbox conversation.

The profile banner has the three-line drawer on the left and a share-arrow menu with Share profile / Block or Unblock on the right. Friend request / follower / following shortcuts are removed from the drawer; social counts remain on the profile. A single View profile button stays under the private-chat portrait. Tapping the conversation header name/photo opens a dedicated chat-info panel for profile, recent-message search, shared media, mute and inbox actions. Group headers open group settings.

Group logos use stable upload-version URLs. Profile and group image responses allow browser caching and ETag conditional requests; inbox avatars have explicit dimensions. Private messages and APIs remain uncached. Admin navigation groups Community, Marketplace, Reports & history, Website & app, and Account. Chat archive has its own page. PWA app settings let the owner save an app name, home-screen name, description and logo; the browser generates 192px / 512px / maskable PNGs. The backend verifies ownership, type and dimensions, then atomically publishes only those icons and updates the dynamic manifest. Existing installed apps adopt metadata on the browser's update schedule.

Validated with role/API tests for archive/delete isolation, symmetric blocking and bypass attempts, group blocking, preserved secure deal access, owner-only PWA branding, icon validation and image caching. Isolated mobile browser checks cover real PNG upload/publication, live manifest changes, 320px and 390px conversations, portraits, menus, archive/unarchive, block/unblock, header info, profile actions and categorized admin navigation.

## Current chat and footer behavior (supersedes earlier view-tracking/Features notes)

Apply the data-only migration `015_recover_hidden_group_chats.sql` after 014. Legacy hidden group inbox entries move into Archived chats, preserving memberships, messages and deals; unarchiving returns them to All chat. The old group Hide API now archives instead of hiding. Blocking a personal contact keeps their conversation visible and readable in All chat, restores it from an archive if necessary and shows an Unblock button beneath the conversation. Sending remains blocked by the backend until both sides' applicable blocks are cleared. Group blocks retain their separate group-access behavior.

Message-author names/photos in private chats are plain identity labels. Other members' names/photos in group chat open exactly three actions: View profile, Message and Block/Unblock. A native chat-header button and nonselectable identity controls remove the full-width selection highlight while preserving chat-info access and keyboard focus. Post Views and automatic view tracking are removed; legacy `/api/posts/:id/view` calls return 410, historical view tables are retained, and guest browsing no longer sets a visitor-tracking cookie. Existing likes/comments/shares remain.

Features contains only Coming soon. A compact footer identifies Rahat wize as website owner with the requested copyright and Powered by credit. Its public Privacy Policy page describes the implemented data visibility, hosting, safety checks, cookies and per-user chat controls. Install settings and existing secure deal functionality remain available in their existing locations.

Validated with the API suite, idempotent legacy archive recovery checks, tracking-retirement tests and isolated 320px/390px browser flows for three-action group author menus, plain private names, blocked All chat visibility, bottom Unblock, group recovery, Coming soon and public footer/privacy navigation.

## Current profile menu, account security and standalone search

The account drawer now contains Edit profile and Account security, then the legal/credit footer and a final red Sign out button. The same account actions apply when visiting another member's profile; the drawer identifies the signed-in member. Admin/setup/role shortcuts and the extra username shortcut have been removed from this menu. The separate `/admin` control room and owner recovery routes are retained. Copyright and Powered by credit appear only inside this drawer, using the requested WizeFF TopUp wording and an `@Rahat Wize` link to `https://rahatwize.com/`. Privacy Policy closes the drawer and opens the public policy page. There is no global credit footer.

`GET /api/account/security` exposes only the current member's own Google login email, active website-session count and current session dates. `POST /api/account/security` with `action: logout_others` revokes only that member's other website/control-room sessions, preserving their current session tokens. Security controls remain available to suspended members; authentication and same-origin protection still apply. No Google password or two-factor setting is stored or changed by the website.

Home's search trigger opens a separate public Search page with Accounts and Posts tabs, keeping Home's category/price filters independent. Empty account search shows recent accounts. `/api/accounts/search` exposes only public discovery fields, searches names/usernames, respects the signed-in member's blocks and never searches or returns emails. Post results use the existing scoped feed API. Full profiles and private actions still require sign-in. Circular close buttons are pinned to the top-right corner of website/admin dialogs, including account security, profile edit, admin recovery and photo crop.

Validation: existing API suite plus search privacy/blocking and account-security session-isolation tests; mobile browser flows for account/post results, minimal member/owner menu, credit link, red Sign out placement, session revocation and popup close geometry.


## Streamlined publishing, reliable albums and profile deal history

Apply additive migration `016_custom_game_names.sql` after 015 before deploying this revision. It adds only a defaulted custom-game name column; existing post/deal UUIDs, serial counters, relationships and media remain intact. New posts use automatic media/listing/price formats, three game choices (Free Fire, eFootball, Custom), and Public or Public + group destinations. Custom names are validated by the API. Existing category values and legacy group-only posts remain readable/editable.

Publishing snapshots the form, moves immediately to the member's profile and continues upload/safety checks while browsing within the open app. Progress, errors and Retry are shown there; the success state counts down for five seconds. Keep the page/app open until completion: this is not an operating-system background upload service. Two concurrent uploads preserve file order, reuse successful uploads on retry and use an account-scoped client key to prevent duplicate listings after a lost publish response. Existing moderation and membership checks are preserved.

Browser-decodable photos are optimized to WebP at high quality with a maximum dimension of 2560px, retaining a smaller accepted original when appropriate. Unsupported device codecs show an actionable error. The memory-only authenticated image loader deduplicates requests, retains reusable object URLs and bounds unused cache storage; private media authorization remains server enforced. Existing originals are not overwritten. The carousel uses a contained image area. Overflow opens a full post with each photo separately; tapping a photo opens a fullscreen gesture viewer with pinch, pan and double-tap zoom. Comments open the post above the comment stream and composer.

The Profile Deals tab is removed. The Completed deals count opens a custom history with total, counterpart profile, deal serial, responsible Admin and completion date. It requires sign-in and omits prices, messages, emails and private audit data. Existing secure deal permissions are unchanged.

Validation: API regression suite plus custom-game validation/editing, idempotent publication and serial preservation, completion-summary privacy and verified comment identities. Isolated Cloudflare D1/Chromium tests at 320px/390px cover all 11 existing photos, request deduplication, album/fullscreen gestures, post comments, profile history, real optimized R2 uploads, immediate profile navigation, in-app background progress, group placement and duplicate-free retry.
