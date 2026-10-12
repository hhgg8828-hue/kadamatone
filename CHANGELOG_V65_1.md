# Khadamat V65.1 — Image Intent Precision

- Improved `اطلب لي` image-aware intent classification.
- When an image is present, visual evidence is treated as primary intent evidence.
- A medicine image with purchase/delivery wording maps to `pharmacy-purchase` when available.
- Unrelated services such as construction are no longer allowed to leak into an image request unless the customer explicitly describes multiple independent needs.
- If an image request is not explicitly compound, AI results are constrained to one service.
- AI-resolved compound state now reflects the actual AI-selected service count instead of inheriting a false compound flag from local candidates.
- Added regression tests for medicine images and hallucinated multi-service AI results.
