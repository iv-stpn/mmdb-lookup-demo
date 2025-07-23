import type { AsnResponse, CityResponse, CountryResponse } from "mmdb-lib";

export interface MMDBDataset {
  name: string;
  url: string;
  type: "asn" | "city" | "country";
}

// Re-export specific mmdb-lib types we need
export type {
  AsnResponse,
  CityResponse,
  CountryResponse,
} from "mmdb-lib";

// Union type for our supported MMDB record types
export type MMDBRecord = AsnResponse | CityResponse | CountryResponse;

export interface LookupResult {
  ip: string;
  dataset: string;
  data: MMDBRecord | null;
  cidrBlock?: string;
  error?: string;
}
