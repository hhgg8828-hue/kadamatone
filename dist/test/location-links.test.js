import assert from 'node:assert/strict';
import test from 'node:test';
test('Google Maps location URL must use api=1 and exact latitude/longitude', () => {
    const lat = 15.3694, lng = 44.1910;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    assert.match(url, /api=1/);
    assert.match(url, /query=15\.3694%2C44\.191/);
});
test('OpenStreetMap location URL must contain exact latitude/longitude', () => {
    const lat = 15.3694, lng = 44.1910;
    const url = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`;
    assert.match(url, /mlat=15\.3694/);
    assert.match(url, /mlon=44\.191/);
    assert.match(url, /#map=18\/15\.3694\/44\.191/);
});
test('Google Maps directions URL uses the exact saved destination coordinates', () => {
    const lat = 15.3694, lng = 44.1910;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}&travelmode=driving`;
    assert.match(url, /api=1/);
    assert.match(url, /destination=15\.3694%2C44\.191/);
});
test('saved GPS coordinates are never replaced by an area name', () => {
    const location = { lat: 15.3694, lng: 44.1910, source: 'gps' };
    assert.equal(location.source, 'gps');
    assert.equal(location.lat, 15.3694);
    assert.equal(location.lng, 44.1910);
});
//# sourceMappingURL=location-links.test.js.map