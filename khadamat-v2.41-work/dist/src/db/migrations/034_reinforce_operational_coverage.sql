-- V2.17: ensure the governorate directory exists on databases upgraded from older releases.
-- Keep the country root inactive; governorate activation remains an explicit admin choice.
INSERT OR IGNORE INTO service_areas(id,parent_id,name_i18n,type,locality_type,center_lat,center_lng,radius_km,is_active,created_at,updated_at) VALUES
('system-yemen',NULL,'{"ar":"اليمن","en":"Yemen"}','COUNTRY','COUNTRY',15.55,48.52,2000,0,datetime('now'),datetime('now')),
('gov-amanat-alasimah','system-yemen','{"ar":"أمانة العاصمة","en":"Amanat Al Asimah Governorate"}','DISTRICT','GOVERNORATE',15.3694,44.1910,35,0,datetime('now'),datetime('now')),
('gov-sanaa','system-yemen','{"ar":"صنعاء","en":"Sana''a Governorate"}','DISTRICT','GOVERNORATE',15.3547,44.2067,90,0,datetime('now'),datetime('now')),
('gov-aden','system-yemen','{"ar":"عدن","en":"Aden Governorate"}','DISTRICT','GOVERNORATE',12.7855,45.0187,35,0,datetime('now'),datetime('now')),
('gov-ibb','system-yemen','{"ar":"إب","en":"Ibb Governorate"}','DISTRICT','GOVERNORATE',13.9759,44.1709,65,1,datetime('now'),datetime('now')),
('gov-taiz','system-yemen','{"ar":"تعز","en":"Taiz Governorate"}','DISTRICT','GOVERNORATE',13.5795,44.0209,70,0,datetime('now'),datetime('now')),
('gov-dhamar','system-yemen','{"ar":"ذمار","en":"Dhamar Governorate"}','DISTRICT','GOVERNORATE',14.5427,44.4051,55,0,datetime('now'),datetime('now')),
('gov-hodeidah','system-yemen','{"ar":"الحديدة","en":"Al Hudaydah Governorate"}','DISTRICT','GOVERNORATE',14.7979,42.9540,90,0,datetime('now'),datetime('now')),
('gov-hajjah','system-yemen','{"ar":"حجة","en":"Hajjah Governorate"}','DISTRICT','GOVERNORATE',15.6943,43.6034,75,0,datetime('now'),datetime('now')),
('gov-saada','system-yemen','{"ar":"صعدة","en":"Saada Governorate"}','DISTRICT','GOVERNORATE',16.9402,43.7639,90,0,datetime('now'),datetime('now')),
('gov-amran','system-yemen','{"ar":"عمران","en":"Amran Governorate"}','DISTRICT','GOVERNORATE',15.6594,43.9439,55,0,datetime('now'),datetime('now')),
('gov-mahwit','system-yemen','{"ar":"المحويت","en":"Al Mahwit Governorate"}','DISTRICT','GOVERNORATE',15.4701,43.5448,45,0,datetime('now'),datetime('now')),
('gov-raymah','system-yemen','{"ar":"ريمة","en":"Raymah Governorate"}','DISTRICT','GOVERNORATE',14.6274,43.7147,45,0,datetime('now'),datetime('now')),
('gov-albayda','system-yemen','{"ar":"البيضاء","en":"Al Bayda Governorate"}','DISTRICT','GOVERNORATE',13.9852,45.5727,80,0,datetime('now'),datetime('now')),
('gov-dhale','system-yemen','{"ar":"الضالع","en":"Al Dhale''e Governorate"}','DISTRICT','GOVERNORATE',13.6957,44.7314,55,0,datetime('now'),datetime('now')),
('gov-lahij','system-yemen','{"ar":"لحج","en":"Lahij Governorate"}','DISTRICT','GOVERNORATE',13.0567,44.8817,60,0,datetime('now'),datetime('now')),
('gov-abyan','system-yemen','{"ar":"أبين","en":"Abyan Governorate"}','DISTRICT','GOVERNORATE',13.6000,45.7000,100,0,datetime('now'),datetime('now')),
('gov-shabwah','system-yemen','{"ar":"شبوة","en":"Shabwah Governorate"}','DISTRICT','GOVERNORATE',14.5000,47.0000,150,0,datetime('now'),datetime('now')),
('gov-marib','system-yemen','{"ar":"مأرب","en":"Marib Governorate"}','DISTRICT','GOVERNORATE',15.4625,45.3258,100,0,datetime('now'),datetime('now')),
('gov-aljawf','system-yemen','{"ar":"الجوف","en":"Al Jawf Governorate"}','DISTRICT','GOVERNORATE',16.5000,45.5000,150,0,datetime('now'),datetime('now')),
('gov-hadramawt','system-yemen','{"ar":"حضرموت","en":"Hadramawt Governorate"}','DISTRICT','GOVERNORATE',14.5400,49.1200,250,0,datetime('now'),datetime('now')),
('gov-almahrah','system-yemen','{"ar":"المهرة","en":"Al Mahrah Governorate"}','DISTRICT','GOVERNORATE',16.0000,52.0000,220,0,datetime('now'),datetime('now')),
('gov-socotra','system-yemen','{"ar":"سقطرى","en":"Socotra Governorate"}','DISTRICT','GOVERNORATE',12.5000,53.9000,80,0,datetime('now'),datetime('now'));
UPDATE service_areas SET is_active=0, updated_at=datetime('now') WHERE id='system-yemen' AND type='COUNTRY';
UPDATE service_areas SET locality_type='GOVERNORATE', updated_at=datetime('now') WHERE id LIKE 'gov-%';
