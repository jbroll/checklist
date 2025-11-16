# Secure Invite Service Implementation Plan

## Overview

Create a service that generates **secure, short-lived invite URLs** with encrypted payloads, including inviter and invitee emails, expiration timestamp, and optional metadata. The URL, when accessed, decrypts the payload and triggers a callback function to execute permission changes or invite acceptance.

---

## Features

1. Encrypt invite data for confidentiality.
2. Short, URL-safe encoding.
3. Expiration timestamp for automatic invalidation.
4. Optional compression for larger payloads.
5. Configurable callback function to execute invite actions.
6. Optional replay prevention / one-time use.

---

## Data Payload Structure (Binary)

* `inviterEmailLength` (1 byte)
* `inviterEmail` (UTF-8)
* `inviteeEmailLength` (1 byte)
* `inviteeEmail` (UTF-8)
* `expiration` (4-byte unsigned integer, UNIX timestamp)
* Optional: `metadata` (variable length)

Estimated size: ~32 bytes for typical emails.

---

## Encryption Strategy

* AES-256-GCM
* Use **deterministic IV** derived from payload + timestamp to avoid transmitting IV (optional, but reduces size).
* Auth tag: 8 bytes (sufficient for short-lived tokens).
* Ciphertext size = payload size.

---

## URL Encoding

* Encode ciphertext + tag using **Base62** or **Base91** for compactness.
* Example URL: `https://yourservice.com/invite/<encoded_token>`
* Target total URL length: 60–70 characters.

---

## Service Endpoints

### 1. Create Invite

* **POST** `/createInvite`
* **Input**: inviterEmail, inviteeEmail, expiresIn (seconds)
* **Process**:

  1. Build binary payload.
  2. Optional: compress payload.
  3. Encrypt payload using AES-256-GCM.
  4. Base62 encode ciphertext + tag.
  5. Return invite URL.

### 2. Redeem Invite

* **GET** `/invite/:token`
* **Process**:

  1. Decode Base62 token.
  2. Decrypt AES-256-GCM.
  3. Verify expiration.
  4. Call `executeInvite(inviter, invitee)` callback.
  5. Optional: mark token as redeemed.

---

## Callback Function

```js
async function executeInvite(inviter, invitee) {
  // Grant permissions
  // Create membership records
  // Send notifications
}
```

---

## Security Considerations

* Store encryption key securely (e.g., environment variable or secret manager).
* Use unique deterministic IVs or true random IVs per token.
* Short-lived tokens reduce replay risk.
* Validate all input data.
* Rate-limit the redeem endpoint.

---

## Optional Optimizations

* Compress payload for large metadata.
* Use shorter auth tags if acceptable.
* Binary encoding of payload reduces overhead vs JSON.
* Use Base91 for maximum compactness.
* One-time-use tokens tracked in DB.

---

## Tools / Libraries

* **Node.js**: `crypto`, `zlib`, Base62 library
* **Python**: `cryptography`, `zlib`, custom Base62 encoder
* Optional: FastAPI / Express.js for endpoints

---

## Next Steps

1. Decide on encoding and compression strategy.
2. Implement encryption/decryption helpers.
3. Build `createInvite` endpoint.
4. Build `redeemInvite` endpoint with callback.
5. Add unit tests for encryption, expiration, and callback execution.
6. Deploy service securely with HTTPS.
7. Monitor usage and token expiration.

---

**Estimated URL Length**: 60–70 characters for typical email payloads.
