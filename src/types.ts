export type Photo = {path:string;name:string;camera:string;takenAt:string;exposureTime:number|null;aperture:number|null;iso:number|null;exposureBias:number|null;focalLength:number|null;ev100:number|null;lensModel?:string|null;width?:number|null;height?:number|null};
export type Group = {id:number;photos:Photo[];confidence:number;exposureSpan:number;reason:string};
export type Result = {photoCount:number;groups:Group[];unmatched:Photo[]};
