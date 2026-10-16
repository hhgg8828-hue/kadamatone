/** Pure catalog filtering logic shared by the customer UI and automated tests. */
export function evaluateServiceFilter(services, key, favoriteIds, options = {}) {
  const favorites = new Set(Array.from(favoriteIds, String));
  const now = options.now ?? Date.now();
  const inCategory = service => !options.selectedCategorySlug || String(service.categorySlug || '') === options.selectedCategorySlug;
  const validDate = service => {
    const date = Date.parse(String(service.createdAt || ''));
    return Number.isFinite(date) && date <= now ? date : null;
  };
  const distance = service => {
    const d = Number(service.distanceKm);
    return options.locationAvailable && Number.isFinite(d) && d >= 0 ? d : Infinity;
  };
  const matches = services.filter(service => {
    if (!inCategory(service)) return false;
    if (key === 'all') return true;
    if (key === 'favorite') return favorites.has(String(service.id));
    if (key === 'new') {
      const date = validDate(service);
      return date !== null;
    }
    return Number.isFinite(distance(service));
  });
  if (key === 'new') matches.sort((a, b) => (validDate(b) ?? -Infinity) - (validDate(a) ?? -Infinity) || (a.originalIndex ?? 0) - (b.originalIndex ?? 0));
  else if (key === 'nearby') matches.sort((a, b) => distance(a) - distance(b) || String(a.id).localeCompare(String(b.id)));
  else matches.sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0));
  const matchIds = new Set(matches.map(service => String(service.id)));
  const remaining = services.filter(service => inCategory(service) && !matchIds.has(String(service.id))).sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0));
  const outsideCategory = services.filter(service => !inCategory(service)).sort((a, b) => (a.originalIndex ?? 0) - (b.originalIndex ?? 0));
  return { matches, ordered: [...matches, ...remaining, ...outsideCategory] };
}


/** Parse the quantities and persisted per-line prices used by order tracking. */
export function parseTrackingProductLines(description, serviceName, formData = {}, trackingAmount = null) {
  const trackingLines = String(description || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const parsed = trackingLines.filter(x => /^\d+[.)]\s*/.test(x) || /الكمية\s*[:：]/.test(x)).map(line => {
    const clean = line.replace(/^\d+[.)]\s*/, '');
    const match = clean.match(/^(.*?)\s*[—-]\s*الكمية\s*[:：]\s*(\d+)/);
    return { name: (match?.[1] || clean).trim(), quantity: match ? Math.max(1, Number(match[2]) || 1) : 1 };
  });
  const rawQuantity = formData.quantity ?? formData.qty ?? formData.count ?? formData.units ?? formData.numberOfItems;
  const quantity = Number.isFinite(Number(rawQuantity)) && Number(rawQuantity) >= 1 ? Math.floor(Number(rawQuantity)) : 1;
  const extras = Array.isArray(formData.additionalServices) ? formData.additionalServices : [];
  const primaryRaw = formData.primaryUnitPriceSnapshot;
  const primaryUnitPrice = primaryRaw !== null && primaryRaw !== undefined && Number.isFinite(Number(primaryRaw)) ? Number(primaryRaw) : null;
  const extraNames = new Set(extras.map(x => String(x.name || '').trim()));
  const primaryRows = parsed.filter(x => !extraNames.has(String(x.name || '').trim()));
  const rows = extras.length
    ? [...(primaryRows.length ? primaryRows : [{ name: serviceName || 'الخدمة', quantity }]), ...extras.map(x => parsed.find(p => String(p.name || '').trim() === String(x.name || '').trim()) || { name: x.name, quantity: Math.max(1, Number(x.quantity) || 1) })]
    : (parsed.length ? parsed : [{ name: serviceName || 'الخدمة', quantity }]);
  return rows.map(item => {
    const extra = extras.find(x => String(x.name || '').trim() === String(item.name || '').trim());
    const unitPrice = extra && extra.unitPrice !== null && extra.unitPrice !== undefined && Number.isFinite(Number(extra.unitPrice))
      ? Number(extra.unitPrice)
      : (!extra && primaryUnitPrice !== null ? primaryUnitPrice : (rows.length === 1 && trackingAmount !== null && Number.isFinite(Number(trackingAmount)) ? Number(trackingAmount) / Math.max(1, item.quantity) : null));
    return { ...item, quantity: Math.max(1, Number(item.quantity) || 1), unitPrice, lineTotal: unitPrice === null ? null : unitPrice * Math.max(1, Number(item.quantity) || 1) };
  });
}
