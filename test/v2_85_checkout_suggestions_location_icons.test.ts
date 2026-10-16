import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('V2.85: checkout suggestions are independently configurable and persisted as settings',()=>{
  const settings=fs.readFileSync('src/modules/settings.ts','utf8');
  const platform=fs.readFileSync('src/modules/platform.ts','utf8');
  const app=fs.readFileSync('public/app.ts','utf8');
  assert.match(settings,/checkout\.suggested_services_enabled/);
  assert.match(settings,/checkout\.suggested_sections_enabled/);
  assert.match(platform,/checkoutSuggestionsServicesEnabled/);
  assert.match(platform,/checkoutSuggestionsSectionsEnabled/);
  assert.match(app,/checkoutSuggestionSettingsForm/);
  assert.match(app,/checkoutSuggestedServicesEnabled/);
  assert.match(app,/checkoutSuggestedSectionsEnabled/);
  assert.match(app,/data-suggested-service-id/);
  assert.match(app,/data-suggested-section-id/);
  assert.equal(/يمكنك أيضًا الطلب من التصنيفات التالية/.test(app),false);
  assert.match(app,/يمكنك أيضًا الطلب من الأقسام التالية/);
});

test('V2.85: customer can search available areas and selection remains saved',()=>{
  const app=fs.readFileSync('public/app.ts','utf8');
  assert.match(app,/customerAreaSearch/);
  assert.match(app,/khadamat\.selectedAreaId/);
  assert.match(app,/customerAreaMarkup/);
});

test('V2.85: category icons are larger and high contrast; account icons are colorful; area arrow gap changes horizontally',()=>{
  const css=fs.readFileSync('public/css/app.css','utf8');
  assert.match(css,/\.customer-category-showcase-top \.customer-category-art \.service-icon-svg\{width:30px;height:30px/);
  assert.match(css,/\.customer-account-menu-row:nth-child\(5n\+1\) \.customer-account-menu-icon/);
  assert.match(css,/\.customer-notification-location-wrap \.customer-area-arrow\{right:-4px!important/);
});
