import { Buffer } from "buffer";
import {
  type AsnResponse,
  type CityResponse,
  type CountryResponse,
  Reader,
  type Response,
} from "mmdb-lib";
import type { MMDBDataset, MMDBRecord } from "./types";

// Utility function for formatting file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
};

export interface MMDBContext {
  dataset: MMDBDataset | null;
  reader: Reader<Response> | null;
}

// Create a new MMDB context
export function createMMDBContext(): MMDBContext {
  return {
    dataset: null,
    reader: null,
  };
}

// Load a dataset and return updated context
export async function loadDataset(
  _context: MMDBContext,
  dataset: MMDBDataset,
  onProgress?: (progress: {
    loaded: number;
    total: number;
    percentage: number;
    phase: string;
    speed?: number;
  }) => void
): Promise<MMDBContext> {
  try {
    console.log(`Loading dataset: ${dataset.name}`);

    onProgress?.({
      loaded: 0,
      total: 0,
      percentage: 0,
      phase: "Connecting to server...",
    });

    // Fetch the MMDB file with progress tracking
    const response = await fetch(dataset.url, {
      mode: "cors",
      headers: {
        Accept: "application/octet-stream",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch MMDB file: ${response.status} ${response.statusText}`
      );
    }

    const contentLength = response.headers.get("content-length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    onProgress?.({
      loaded: 0,
      total,
      percentage: 0,
      phase:
        total > 0
          ? `Downloading ${dataset.name} (${formatFileSize(total)})...`
          : `Downloading ${dataset.name}...`,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const startTime = Date.now();

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      if (value) {
        chunks.push(value);
        loaded += value.length;

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0.5 ? loaded / elapsed : 0; // Only calculate speed after 500ms
        const percentage =
          total > 0
            ? Math.round((loaded / total) * 100)
            : Math.min(50, Math.round((loaded / 10000) * 100)); // Fallback progress for unknown size

        onProgress?.({
          loaded,
          total,
          percentage,
          phase: `Downloading ${dataset.name}...`,
          speed,
        });
      }
    }

    onProgress?.({
      loaded,
      total: loaded,
      percentage: 100,
      phase: "Processing dataset...",
    });

    // Combine all chunks into a single ArrayBuffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const mmdbBuffer = new ArrayBuffer(totalLength);
    const uint8View = new Uint8Array(mmdbBuffer);
    let offset = 0;

    for (const chunk of chunks) {
      uint8View.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert ArrayBuffer to Buffer for mmdb-lib
    const buffer = Buffer.from(mmdbBuffer);

    // Initialize the MMDB reader with the real data
    const mmdbReader = new Reader(buffer);

    console.log(
      `Successfully loaded ${dataset.name} (${mmdbBuffer.byteLength} bytes)`
    );

    onProgress?.({
      loaded,
      total: loaded,
      percentage: 100,
      phase: "Dataset loaded successfully!",
    });

    return { dataset, reader: mmdbReader };
  } catch (error) {
    console.error("Error loading MMDB dataset:", error);
    throw new Error(
      `Failed to load MMDB dataset: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Lookup an IP address
export async function lookupIP(
  context: MMDBContext,
  ip: string
): Promise<MMDBRecord | null> {
  if (!context.dataset || !context.reader) {
    throw new Error("No dataset loaded");
  }

  // Validate IP address format
  if (!isValidIP(ip)) {
    throw new Error("Invalid IP address format");
  }

  try {
    // Use the real MMDB reader to lookup the IP
    const result = context.reader.get(ip);

    if (!result) {
      return null;
    }

    console.log(`Lookup result for IP ${ip}:`, result);
    // Transform the result based on dataset type
    return transformResult(result, context.dataset.type);
  } catch (error) {
    console.error("Error looking up IP:", error);
    throw new Error(
      `IP lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Find CIDR block for an IP
export async function findCIDRBlock(
  context: MMDBContext,
  ip: string
): Promise<string | null> {
  if (!context.dataset || !context.reader) {
    throw new Error("No dataset loaded");
  }

  // Validate IP address format
  if (!isValidIP(ip)) {
    throw new Error("Invalid IP address format");
  }

  try {
    // Get the data for our target IP
    const targetData = context.reader.get(ip);
    if (!targetData) {
      return null;
    }

    // Convert target data to string for comparison
    const targetDataStr = JSON.stringify(targetData);

    // Check if it's IPv4 or IPv6
    const isIPv4 = ip.includes(".");

    if (isIPv4) {
      return findIPv4CIDRBlock(context.reader, ip, targetDataStr);
    } else {
      return findIPv6CIDRBlock(context.reader, ip, targetDataStr);
    }
  } catch (error) {
    console.error("Error finding CIDR block:", error);
    return null;
  }
}

// Find IPv4 CIDR block by traversing bit by bit
function findIPv4CIDRBlock(
  reader: Reader<Response>,
  ip: string,
  targetDataStr: string
): string | null {
  // Convert IP to 32-bit integer for bit manipulation
  const parts = ip.split(".").map(Number);
  const ipInt =
    (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];

  // Walk the tree by checking each bit position
  for (let bit = 0; bit < 32; bit++) {
    const currentPrefix = bit + 1;

    // Calculate the network address for this prefix length
    const mask = 0xffffffff << (32 - currentPrefix);
    const currentNetwork = ipInt & mask;

    // Convert network address back to IP string
    const networkParts = [
      (currentNetwork >>> 24) & 0xff,
      (currentNetwork >>> 16) & 0xff,
      (currentNetwork >>> 8) & 0xff,
      currentNetwork & 0xff,
    ];

    const networkIP = networkParts.join(".");

    // Test if this network IP returns the same data as our target
    try {
      const networkData = reader.get(networkIP);
      const networkDataStr = JSON.stringify(networkData);

      // If the data matches, we found our CIDR block
      if (networkDataStr === targetDataStr) {
        return `${networkIP}/${currentPrefix}`;
      }
    } catch {
      // If lookup fails, continue to next bit
      continue;
    }

    // Also test if the current bit position changes the result
    // by testing an IP with the opposite bit value
    const testBit = 1 << (31 - bit);
    const alternateIP = ipInt ^ testBit;

    // Make sure the alternate IP is in the same network as we're testing
    if ((alternateIP & mask) === currentNetwork) {
      const alternateParts = [
        (alternateIP >>> 24) & 0xff,
        (alternateIP >>> 16) & 0xff,
        (alternateIP >>> 8) & 0xff,
        alternateIP & 0xff,
      ];

      const alternateIPStr = alternateParts.join(".");

      try {
        const alternateData = reader.get(alternateIPStr);
        const alternateDataStr = JSON.stringify(alternateData);

        // If alternate IP returns different data, we found the boundary
        if (alternateDataStr !== targetDataStr) {
          return `${networkIP}/${currentPrefix}`;
        }
      } catch {
        // If alternate IP lookup fails, assume it's different
        return `${networkIP}/${currentPrefix}`;
      }
    }
  }

  // If we get here, return the most specific /32 block
  return `${ip}/32`;
}

// Find IPv6 CIDR block (simplified approach)
function findIPv6CIDRBlock(
  reader: Reader<Response>,
  ip: string,
  targetDataStr: string
): string | null {
  // For IPv6, we'll use a simplified approach testing common prefix lengths
  const commonPrefixes = [128, 64, 56, 48, 40, 32, 24, 16];

  for (const prefix of commonPrefixes) {
    try {
      // Create a simplified IPv6 CIDR block representation
      const parts = ip.split(":");
      let cidrBlock: string;

      if (prefix >= 64) {
        // Use first 4 groups for /64 and higher
        cidrBlock = `${parts.slice(0, 4).join(":")}::/${prefix}`;
      } else if (prefix >= 32) {
        // Use first 2 groups for /32 to /63
        cidrBlock = `${parts.slice(0, 2).join(":")}::/${prefix}`;
      } else {
        // Use first group for less than /32
        cidrBlock = `${parts[0]}::/${prefix}`;
      }

      // Test a few IPs in this range to see if they return the same data
      const testResult = reader.get(ip);
      if (testResult && JSON.stringify(testResult) === targetDataStr) {
        return cidrBlock;
      }
    } catch {}
  }

  return `${ip}/128`; // Most specific IPv6 block
}

// Helper function to validate IPv4 and IPv6 addresses
function isValidIP(ip: string): boolean {
  // IPv4 validation
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // IPv6 validation (comprehensive)
  const ipv6Regex =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// Function to identify reserved, special, or unallocated IP ranges
export function getIPRangeDescription(ip: string): string | null {
  if (ip.includes(".")) {
    return getIPv4RangeDescription(ip);
  } else {
    return getIPv6RangeDescription(ip);
  }
}

// IPv4 reserved ranges
function getIPv4RangeDescription(ip: string): string | null {
  const parts = ip.split(".").map(Number);
  const [a, b, c, d] = parts;

  // RFC 1918 - Private networks
  if (a === 10) {
    return "This is a private IP address (RFC 1918: 10.0.0.0/8) and is not routed on the internet.";
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return "This is a private IP address (RFC 1918: 172.16.0.0/12) and is not routed on the internet.";
  }
  if (a === 192 && b === 168) {
    return "This is a private IP address (RFC 1918: 192.168.0.0/16) and is not routed on the internet.";
  }

  // RFC 5735 - Special-Use IPv4 Addresses
  if (a === 0) {
    return "This is a 'this network' address (RFC 5735: 0.0.0.0/8) used for network configuration.";
  }
  if (a === 127) {
    return "This is a loopback address (RFC 5735: 127.0.0.0/8) used for local host communication.";
  }
  if (a === 169 && b === 254) {
    return "This is a link-local address (RFC 5735: 169.254.0.0/16) used for automatic IP configuration.";
  }
  if (a === 224 && b === 0 && c === 0) {
    return "This is a local network control block address (RFC 5735: 224.0.0.0/24) used for multicast.";
  }
  if (a >= 224 && a <= 239) {
    return "This is a multicast address (RFC 5735: 224.0.0.0/4) used for group communication.";
  }
  if (a >= 240) {
    return "This is a reserved address (RFC 5735: 240.0.0.0/4) for future use.";
  }

  // RFC 3927 - Link-Local
  if (a === 169 && b === 254) {
    return "This is a link-local address (RFC 3927: 169.254.0.0/16) used for automatic IP configuration.";
  }

  // RFC 6598 - Shared Address Space
  if (a === 100 && b >= 64 && b <= 127) {
    return "This is a shared address space (RFC 6598: 100.64.0.0/10) used by carriers for NAT.";
  }

  // RFC 5737 - Documentation
  if (a === 192 && b === 0 && c === 2) {
    return "This is a documentation address (RFC 5737: 192.0.2.0/24) used in examples and documentation.";
  }
  if (a === 198 && b === 51 && c === 100) {
    return "This is a documentation address (RFC 5737: 198.51.100.0/24) used in examples and documentation.";
  }
  if (a === 203 && b === 0 && c === 113) {
    return "This is a documentation address (RFC 5737: 203.0.113.0/24) used in examples and documentation.";
  }

  // RFC 3068 - 6to4 Relay Anycast
  if (a === 192 && b === 88 && c === 99) {
    return "This is a 6to4 relay anycast address (RFC 3068: 192.88.99.0/24) used for IPv6 transition.";
  }

  // RFC 2544 - Benchmarking
  if (a === 198 && b >= 18 && b <= 19) {
    return "This is a benchmarking address (RFC 2544: 198.18.0.0/15) used for network testing.";
  }

  // IANA Reserved
  if (a === 255 && b === 255 && c === 255 && d === 255) {
    return "This is the limited broadcast address (255.255.255.255) used for network broadcasts.";
  }

  return null; // Not a known reserved range
}

// IPv6 reserved ranges
function getIPv6RangeDescription(ip: string): string | null {
  const normalizedIP = ip.toLowerCase();

  // Loopback
  if (normalizedIP === "::1") {
    return "This is the IPv6 loopback address (::1) used for local host communication.";
  }

  // Unspecified
  if (
    normalizedIP === "::" ||
    normalizedIP === "0000:0000:0000:0000:0000:0000:0000:0000"
  ) {
    return "This is the IPv6 unspecified address (::) used to indicate no address.";
  }

  // Link-local
  if (normalizedIP.startsWith("fe80:")) {
    return "This is a link-local address (fe80::/10) used for communication within a single network segment.";
  }

  // Unique local
  if (normalizedIP.startsWith("fc") || normalizedIP.startsWith("fd")) {
    return "This is a unique local address (fc00::/7) used for private networks, similar to IPv4 private addresses.";
  }

  // Multicast
  if (normalizedIP.startsWith("ff")) {
    return "This is a multicast address (ff00::/8) used for group communication.";
  }

  // Documentation (RFC 3849)
  if (normalizedIP.startsWith("2001:db8:")) {
    return "This is a documentation address (2001:db8::/32) used in examples and documentation.";
  }

  // 6to4 (RFC 3056)
  if (normalizedIP.startsWith("2002:")) {
    return "This is a 6to4 address (2002::/16) used for IPv6 transition over IPv4.";
  }

  // Teredo (RFC 4380)
  if (
    normalizedIP.startsWith("2001:0000:") ||
    normalizedIP.startsWith("2001::")
  ) {
    return "This is a Teredo address (2001::/32) used for IPv6 connectivity through NAT.";
  }

  // Benchmarking (RFC 5180)
  if (normalizedIP.startsWith("2001:2:")) {
    return "This is a benchmarking address (2001:2::/48) used for network testing.";
  }

  // ORCHID (RFC 4843)
  if (
    normalizedIP.startsWith("2001:10:") ||
    normalizedIP.startsWith("2001:20:")
  ) {
    return "This is an ORCHID address (2001:10::/28) used for cryptographic hash identifiers.";
  }

  // IPv4-mapped IPv6
  if (normalizedIP.includes("::ffff:")) {
    return "This is an IPv4-mapped IPv6 address (::ffff:0:0/96) representing an IPv4 address in IPv6 format.";
  }

  // IPv4-compatible IPv6 (deprecated)
  if (normalizedIP.startsWith("::") && normalizedIP.includes(".")) {
    return "This is an IPv4-compatible IPv6 address (deprecated) representing an IPv4 address in IPv6 format.";
  }

  return null; // Not a known reserved range
}

// Transform MMDB result based on dataset type
function transformResult(result: Response, datasetType: string): MMDBRecord {
  switch (datasetType) {
    case "asn":
      // Type guard for ASN response
      if (isAsnResponse(result)) {
        return result;
      }
      // Fallback for ASN data without proper structure
      return {
        autonomous_system_number: 0,
        autonomous_system_organization: "Unknown",
      };

    case "city":
      // Type guard for City response
      if (isCityResponse(result)) {
        return result;
      }
      // Fallback for City data without proper structure
      return {};

    case "country":
      // Type guard for Country response
      if (isCountryResponse(result)) {
        return result;
      }
      // Fallback for Country data without proper structure
      return {};

    default:
      // Default fallback - try to return as Country response
      return result as CountryResponse;
  }
}

// Type guards
function isAsnResponse(result: Response): result is AsnResponse {
  return (
    "autonomous_system_number" in result &&
    typeof result.autonomous_system_number === "number"
  );
}

function isCityResponse(result: Response): result is CityResponse {
  // City responses can have city, location, postal, or subdivisions fields
  return (
    "city" in result ||
    "location" in result ||
    "postal" in result ||
    "subdivisions" in result
  );
}

function isCountryResponse(result: Response): result is CountryResponse {
  // Country responses have country or continent fields
  return "country" in result || "continent" in result;
}
