# Share Discoverability + Optional Invite Email — Design

**Date:** 2026-06-24
**Status:** Draft for review

## Problem

The folder ShareDialog has poor discoverability of how to deliver an invite, and
email behavior is wrong for the desired model:

1. **Discoverability:** The native Web Share action is a tiny icon that only
   appears *after* "Get Link", and is hidden entirely on desktop browsers that
   lack `navigator.share` (most Linux/Windows Chrome/Firefox). On desktop the
   only visible delivery action is a Copy icon.
2. **Email is not optional:** The jbr-jazz `hierarchy-backend` invite endpoint
   (`/api/shares/invite`) **always** emails the recipient when SMTP is
   configured (`shares.ts:198-216`). Production has working PurelyMail SMTP
   (`smtp.purelymail.com:587`, from `CheckList <invite@checklist.rkroll.com>`),
   so every invite already emails the recipient — invisibly, with no UI feedback.

## Desired behavior

Delivery is **capability-gated** on `navigator.share` ("OS sharing"). The action
row has **two** buttons: a persistent **Copy**, plus a single **primary slot**
that is *substituted* based on capability — **Share** when OS sharing exists,
**Email Invite** when it doesn't. There is no disabled "Share" button and no
"unavailable" messaging on desktop.

| `navigator.share` | Action row | Primary behavior |
|---|---|---|
| available (mobile/PWA) | `[ Copy ]  [ Share ]` | Share opens OS share sheet; invite created **without** email (`sendEmail:false`) |
| unavailable (desktop) | `[ Copy ]  [ Email Invite ]` | creates invite **and** sends backend email (`sendEmail:true`) |

**Hard rule:** the backend invite email fires **only** in the desktop (no OS
sharing) case via the Email Invite button. Copy never emails. A device with OS
sharing never sends backend email.

**UI principle (from user):** *always visible ≠ enabled.* The two buttons are
always rendered (discoverable) but disabled until the recipient email/phone is
valid. The Share↔Email Invite swap is a substitution, not a disabled state.

## Scope

- White-label / branding of the email body is **out of scope** (keep the
  package's existing text/HTML template).
- "Resend email" for existing pending invites is **out of scope**.
- Web Share Target (receiving shares) is **out of scope**.

## Design

### 1. Backend — jbr-jazz `hierarchy` (sibling repo `/home/john/src/jbr-jazz`)

Add an optional, backward-compatible `sendEmail` flag to the invite-create path.
Default `true`, so existing consumers and behavior are unchanged.

- **`packages/hierarchy/backend/src/shares.ts`**
  - `inviteSchema` (line 64): add `sendEmail: z.boolean().default(true)`.
  - Handler (line 153): destructure `sendEmail`.
  - Send gate (line 199): `if (sendEmail && transporter && config.smtpFrom)`.
  - **Untouched:** the two auth emails sharing the same transporter — verification
    (`shares.ts:320` region / package auth) and "verify additional email"
    (line 1258). Only the invite `sendMail` is gated.
- **`packages/hierarchy/client`** (`useSharing`)
  - `createInvite` and `createInviteAndGrantAgent` accept an optional
    `sendEmail?: boolean` (default `true`) and include it in the POST body to
    `/api/shares/invite`.
- **Shared types** (`packages/hierarchy/shared`): extend the invite-request type
  with optional `sendEmail` if such a type is exported.
- Rebuild the package (`tsup`) so checklist's `file:`-linked `dist` picks it up.

### 2. Frontend — checklist `src/components/sharing/ShareDialog.tsx`

- Replace the post-link icon strip (current lines ~253–281) with a **two-button
  action row** of labeled buttons: a persistent **Copy** plus a capability-swapped
  primary button (**Share** or **Email Invite**).
- Capability detection already present: `hasWebShare = 'share' in navigator`
  (line 15). It selects which primary button renders.
- Each action ensures an invite exists (creating it on demand via
  `createInviteAndGrantAgent`) then performs its channel:
  - **Copy** (always) → create with `sendEmail:false` → `navigator.clipboard.writeText(shareUrl)`.
  - **Share** (rendered only when `hasWebShare`) → create with `sendEmail:false` → `navigator.share({ title, text, url })`.
  - **Email Invite** (rendered only when `!hasWebShare`) → create with `sendEmail:true`.
    Backend sends the mail; UI shows "✓ Invite emailed to <recipient>".
- Both buttons are disabled until the recipient email/phone is valid
  (`isRecipientValid()`, line 95). No tooltip for an "unavailable" Share — it is
  simply not rendered on desktop.
- Keep permission + expiry selectors and the pending-invites / collaborators
  lists as-is.

### 3. Data flow

```
User enters recipient + permission/expiry
   │
   ├── taps Copy  ─► createInvite(sendEmail:false) ─► clipboard
   ├── taps Share ─► createInvite(sendEmail:false) ─► navigator.share()   (mobile only)
   └── taps Email ─► createInvite(sendEmail:true)  ─► backend sendMail()  (desktop only)
```

The `sendEmail` boolean is the single control crossing the client→backend
boundary; the OS-share-vs-email policy lives entirely in the frontend.

## Testing

- **Backend (jbr-jazz):** unit test `/api/shares/invite` — `sendEmail:false`
  creates the invite and does **not** call the transporter; default/`true` does.
  Mock the SMTP transporter and assert call count.
- **Frontend:** component test of ShareDialog — with `navigator.share` stubbed
  present: the **Share** button renders (no Email Invite button) and creates
  invites with `sendEmail:false`. With it absent: the **Email Invite** button
  renders (no Share button) and creates with `sendEmail:true`. Assert Copy never
  sets `sendEmail:true`, and both buttons are disabled until the recipient is valid.
- **Manual:** desktop (no Web Share) → Email path delivers via PurelyMail;
  mobile/PWA → Share opens OS sheet and no email is sent.

## Risks / notes

- jbr-jazz is a shared sibling package; the change is additive (default `true`)
  so other consumers (e.g. wicketmap) are unaffected.
- The package's `sendMail` is fire-and-forget; delivery failures are already
  silent. Surfacing send errors is out of scope but noted.
- Requires rebuilding/redeploying the jbr-jazz package alongside checklist.
