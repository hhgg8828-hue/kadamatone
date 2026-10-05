# V66.15 — Provider chat and notification UX

- Provider/customer order chat remains one shared conversation.
- Opening a provider chat notification opens the order conversation directly, without routing through complaint UI.
- Active chat is not destroyed by CHAT_MESSAGE realtime notifications, preserving the open composer while messages arrive.
- Provider notification area is compact; detailed notifications remain available through “مشاهدة الإشعارات”.
- Dedicated notification view loads up to 100 recent notifications.
- Complaint controls on provider order details appear only when a complaint actually exists.
- Existing capabilities, vehicle approval, messaging reliability, location messages and service/campaign flows were preserved.
