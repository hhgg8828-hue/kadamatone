# V25 — Provider verification document lifecycle

- One current ID and one current LICENSE per provider; duplicate current records are consolidated by migration and protected by a partial unique index.
- Replacing a document updates the current record, resets review state to PENDING, clears review metadata, and removes the superseded file.
- Provider UI now shows one card per verification document type, with filename, size, status, review note, and View File.
- Selecting a file no longer uploads immediately: the provider confirms with “رفع وإرسال للمراجعة” or cancels first.
- Rejected documents display the admin review note and can be replaced.
- Admin verification requires both ID and LICENSE; verification marks both documents APPROVED. Rejection/suspension marks current verification documents REJECTED with the review reason and forces offline.
- Added end-to-end tests for uniqueness, replacement, required documents, approval/rejection, and current frontend version.
