-- V85.3: retain the selected type of identity document for provider verification.
ALTER TABLE provider_documents ADD COLUMN identity_type TEXT
  CHECK (identity_type IS NULL OR identity_type IN ('NATIONAL_ID','RESIDENT_ID','PASSPORT','OTHER'));
