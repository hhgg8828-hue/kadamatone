# V66.16 — Smart request matching and order-chat quality

- Improved Arabic intent matching for shopping/grocery phrases such as `مقاضي`, `بقالة`, and `مشتريات البيت`.
- Fixed an intent ambiguity where the generic word `غرض` could incorrectly turn a normal parcel-delivery request into a purchase request.
- Preserved the exact purchase-and-delivery path for requests such as `أريد واحد يشتري لي بيبسي ويوصله للبيت`.
- Order chat remains one private conversation bound to the order; unrelated providers cannot read or send messages.
- Chat notifications now identify the sender without exposing the message body in the notification preview.
- Added regression coverage for smart matching and chat privacy.
