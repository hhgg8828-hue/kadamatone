export type ServiceFilterKey = 'all' | 'nearby' | 'new' | 'favorite';
export interface FilterableService { id:string; createdAt?:string|null; latitude?:number|string|null; longitude?:number|string|null; categorySlug?:string|null; distanceKm?:number|null; originalIndex?:number; }
export interface ServiceFilterOptions { now?:number; recentWindowMs?:number; locationAvailable?:boolean; selectedCategorySlug?:string; }
export interface ServiceFilterResult<T extends FilterableService> { matches:T[]; ordered:T[]; }
export function evaluateServiceFilter<T extends FilterableService>(services:T[], key:ServiceFilterKey, favoriteIds:Iterable<string>, options?:ServiceFilterOptions):ServiceFilterResult<T>;

export interface TrackingProductLine { name:string; quantity:number; unitPrice:number|null; lineTotal:number|null; }
export function parseTrackingProductLines(description:string, serviceName:string, formData?:Record<string,any>, trackingAmount?:number|null):TrackingProductLine[];
